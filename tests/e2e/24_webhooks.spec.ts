/* 外からの通知（webhook）を偽って送っても、注文・本人確認が動かないこと（担当 B）。
   試験の環境は mock なので、Stripe・PayPay は「受けない（503）」が正しい答え。本番の鍵があるときは署名で 400／401 になる。 */
import { createHmac, randomUUID } from "node:crypto";
import { freshUser, lit, seedListing, sql, type Cast } from "./_db";
import { freshPair, orderRow, rand, seedPendingOrder } from "./_b";
import { expect, test } from "./_fixtures";

async function eventsSince(provider: string, since: string): Promise<number> {
  const [r] = await sql<{ n: number }>(
    `select count(*)::int as n from public.payment_events where provider = ${lit(provider)} and received_at >= ${lit(since)}::timestamptz`,
  );
  return r.n;
}

async function dbNow(): Promise<string> {
  const [r] = await sql<{ now: string }>("select now()::text as now");
  return r.now;
}

/** 支払い待ちの注文を1件作る */
async function pendingOrder(): Promise<{ groupId: string; orderId: string; total: number; listingId: string }> {
  const { seller, buyer } = await freshPair();
  const listingId = await seedListing(seller);
  const o = await seedPendingOrder(buyer, [listingId]);
  return { groupId: o.groupId, orderId: o.orderIds[0], total: o.total, listingId };
}

test.describe("Stripe の通知", () => {
  test("署名なし・偽の署名で支払い完了を送っても断られ、注文は支払い待ちのまま", async ({ request }) => {
    const o = await pendingOrder();
    const since = await dbNow();
    const event = JSON.stringify({
      id: `evt_e2e_${rand()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_e2e_${rand()}`,
          object: "checkout.session",
          payment_status: "paid",
          amount_total: o.total,
          client_reference_id: o.groupId,
          metadata: { group_id: o.groupId },
        },
      },
    });
    const noSig = await request.post("/api/webhooks/stripe", { data: event, headers: { "content-type": "application/json" } });
    expect([400, 503]).toContain(noSig.status());
    const badSig = await request.post("/api/webhooks/stripe", {
      data: event,
      headers: { "content-type": "application/json", "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` },
    });
    expect([400, 503]).toContain(badSig.status());

    expect((await orderRow(o.orderId)).status).toBe("pending");
    const [l] = await sql<{ status: string }>(`select status from public.listings where id = ${lit(o.listingId)}`);
    expect(l.status).toBe("published");
    expect(await eventsSince("stripe", since)).toBe(0);
  });
});

test.describe("PayPay の通知", () => {
  test("偽の支払い完了の通知を送っても、注文は支払い待ちのまま", async ({ request }) => {
    const o = await pendingOrder();
    const forged = await request.post("/api/webhooks/paypay", {
      data: { notification_type: "Transaction", merchant_order_id: o.groupId, state: "COMPLETED", order_amount: o.total },
    });
    // mock では受けない（503）。本番でも PayPay に聞き直すので、払われていなければ何も起きない
    expect([200, 400, 503]).toContain(forged.status());
    const broken = await request.post("/api/webhooks/paypay", {
      data: "{これは JSON ではない",
      headers: { "content-type": "application/json" },
    });
    expect([400, 503]).toContain(broken.status());
    const notUuid = await request.post("/api/webhooks/paypay", { data: { merchant_order_id: "1 or 1=1", state: "COMPLETED" } });
    expect([400, 503]).toContain(notUuid.status());

    expect((await orderRow(o.orderId)).status).toBe("pending");
  });
});

test.describe("本人確認の会社からの通知", () => {
  async function trustdockPending(): Promise<{ user: Cast; ref: string }> {
    const user = await freshUser("b-buy", { role: "buyer", kyc: "pending" });
    const ref = `e2e-ref-${randomUUID()}`;
    await sql(`
      insert into public.kyc_applications (user_id, provider, doc_type, status, provider_ref)
      values (${lit(user.id)}, 'trustdock', 'license', 'pending', ${lit(ref)})`);
    return { user, ref };
  }

  test("署名なし・違う鍵の署名で承認を送っても断られ、本人確認は審査中のまま", async ({ request }) => {
    const { user, ref } = await trustdockPending();
    const body = JSON.stringify({ event_id: `e2e-${rand()}`, ref, result: "approved" });
    const noSig = await request.post("/api/webhooks/kyc", { data: body, headers: { "content-type": "application/json" } });
    expect([401, 503]).toContain(noSig.status());

    const wrong = createHmac("sha256", "e2e-wrong-secret").update(body, "utf8").digest("hex");
    const badSig = await request.post("/api/webhooks/kyc", {
      data: body,
      headers: { "content-type": "application/json", "x-pantia-signature": `sha256=${wrong}` },
    });
    expect([401, 503]).toContain(badSig.status());
    const junkSig = await request.post("/api/webhooks/kyc", {
      data: body,
      headers: { "content-type": "application/json", "x-pantia-signature": "not-a-signature" },
    });
    expect([401, 503]).toContain(junkSig.status());

    const [app] = await sql<{ status: string }>(`select status from public.kyc_applications where provider_ref = ${lit(ref)}`);
    expect(app.status).toBe("pending");
    const [p] = await sql<{ kyc_status: string }>(`select kyc_status from public.profiles where id = ${lit(user.id)}`);
    expect(p.kyc_status).toBe("pending");
  });
});
