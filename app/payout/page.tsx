/* 振込（出品者だけ）。残高・最低振込額・振込手数料、申請、振込先の口座、申請の履歴。
   口座番号はここ（server）でだけ読み、画面には下4桁しか渡さない。 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { dateJst, last4, num, yen } from "@/lib/format";
import { PAYOUT_STATUS } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import MypageShell from "@/components/mypage/MypageShell";
import BankAccountForm, { type BankView } from "@/components/mypage/BankAccountForm";
import PayoutRequestForm from "@/components/mypage/PayoutRequestForm";
import { getMyBalance } from "@/components/mypage/data";

export const metadata: Metadata = { title: "振込", robots: { index: false, follow: false } };

const HISTORY_LIMIT = 30;
const TYPE_LABEL: Record<string, string> = { ordinary: "普通", current: "当座" };

function statusClass(status: string): string {
  if (status === "paid") return "order-status status-done";
  if (status === "rejected") return "order-status mp-status-muted";
  return "order-status status-ship";
}

export default async function PayoutPage() {
  const viewer = await requireViewer("/payout");
  if (viewer.role !== "seller") redirect("/mypage");
  const kycOk = viewer.kycStatus === "approved";

  const supabase = await createClient();
  const [balance, settings, bankRes, payoutsRes] = await Promise.all([
    getMyBalance(),
    getSettings(),
    supabase
      .from("bank_accounts")
      .select("bank_name, branch_name, account_type, account_number, holder_kana")
      .eq("user_id", viewer.id)
      .maybeSingle(),
    supabase
      .from("payouts")
      .select(
        "id, payout_no, amount, fee, net, bank_name, branch_name, account_type, account_last4, status, reject_reason, requested_at, decided_at",
      )
      .eq("user_id", viewer.id)
      .order("requested_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  if (bankRes.error) console.error("[payout] bank", bankRes.error.message);
  if (payoutsRes.error) console.error("[payout] history", payoutsRes.error.message);

  const b = bankRes.data;
  const bank: BankView | null = b
    ? {
        bankName: b.bank_name,
        branchName: b.branch_name,
        accountType: b.account_type === "current" ? "current" : "ordinary",
        last4: last4(b.account_number),
        holderKana: b.holder_kana,
      }
    : null;
  const bankLabel = bank
    ? `${bank.bankName} ${bank.branchName} ${TYPE_LABEL[bank.accountType]} ${bank.last4}（${bank.holderKana}）`
    : null;
  const payouts = payoutsRes.data ?? [];
  const hasOpen = payouts.some((p) => p.status === "requested");

  return (
    <MypageShell active="payout">
      <div className="mp-section-head">
        <h1 className="mp-section-title">
          <span className="icon-pill">🏦</span> 振込
        </h1>
        <Link href="/mypage/sales" className="mp-more">
          売上を見る →
        </Link>
      </div>

      <div className="sales-summary">
        <div className="ss-card">
          <div className="ss-label">振込申請可能額</div>
          <div className="ss-num">{yen(balance)}</div>
          <div className="ss-sub">取引が完了した売上の残り</div>
        </div>
        <div className="ss-card">
          <div className="ss-label">最低振込額</div>
          <div className="ss-num">{yen(settings.minPayout)}</div>
          <div className="ss-sub">この額から申請できます</div>
        </div>
        <div className="ss-card">
          <div className="ss-label">振込手数料</div>
          <div className="ss-num">{yen(settings.payoutFee)}</div>
          <div className="ss-sub">{settings.payoutFee > 0 ? "申請額から引かれます" : "無料です"}</div>
        </div>
      </div>

      {/* 振込申請 */}
      <div className="payout-card">
        <div className="payout-header">
          <div className="payout-title">
            <span className="icon-pill">🏦</span> 振込申請
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>現在の振込可能残高</div>
        <div className="balance-big">{yen(balance)}</div>
        <PayoutRequestForm
          balance={balance}
          minPayout={settings.minPayout}
          payoutFee={settings.payoutFee}
          bankLabel={bankLabel}
          kycOk={kycOk}
          hasOpen={hasOpen}
        />
      </div>

      {/* 振込口座 */}
      <div className="settings-section">
        <div className="settings-title">
          <span className="icon-pill">🏦</span> 振込口座
        </div>
        {!bank && <p className="mp-hint">振込を受け取る口座を登録してください。登録した口座番号は、下4桁だけを表示します。</p>}
        <BankAccountForm current={bank} />
      </div>

      {/* 申請の履歴 */}
      <div className="payout-card">
        <div className="payout-header">
          <div className="payout-title">
            <span className="icon-pill">📋</span> 振込申請の履歴
          </div>
        </div>
        {payouts.length === 0 ? (
          <div className="mp-empty">まだ振込の申請はありません。</div>
        ) : (
          <div className="mp-table-wrap">
            <table className="payout-table">
              <thead>
                <tr>
                  <th>申請日</th>
                  <th>振込先</th>
                  <th>申請額</th>
                  <th>振込額</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="mp-muted">
                      {dateJst(p.requested_at)}
                      <br />
                      <small>No.{num(p.payout_no)}</small>
                    </td>
                    <td>
                      {p.bank_name} {p.branch_name}
                      <br />
                      <small className="mp-muted">
                        {TYPE_LABEL[p.account_type] ?? p.account_type} ****{p.account_last4}
                      </small>
                    </td>
                    <td className="tx-minus">- {yen(p.amount)}</td>
                    <td>
                      {yen(p.net)}
                      {p.fee > 0 && <small className="mp-muted">（手数料 {yen(p.fee)}）</small>}
                    </td>
                    <td>
                      <span className={statusClass(p.status)}>{PAYOUT_STATUS[p.status] ?? p.status}</span>
                      {p.status === "paid" && p.decided_at && (
                        <small className="mp-muted"> {dateJst(p.decided_at)}</small>
                      )}
                      {p.status === "rejected" && p.reject_reason && (
                        <div className="mp-hint">理由：{p.reject_reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {payouts.length >= HISTORY_LIMIT && <p className="mp-hint">新しい順に {HISTORY_LIMIT} 件まで出しています。</p>}
        <p className="mp-hint">差し戻しになった申請の金額は、残高に戻ります。</p>
      </div>
    </MypageShell>
  );
}
