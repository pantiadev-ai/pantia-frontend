/* 自分の出品を編集する（見本 item_form.html）。出品者の本人の出品だけ。
   運営が止めた（hidden）・削除した（deleted）出品は開けない。売り切れ（sold）は直せないことを出す。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import "@/styles/item-form.css";
import "@/components/listings/listing-form.css";
import SiteHeader from "@/components/SiteHeader";
import ListingForm, { type ListingFormStatus, type ListingFormValues } from "@/components/listings/ListingForm";
import { getMyProfile } from "@/components/mypage/data";
import { requireViewer } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { CATEGORIES, COLORS, MATERIALS, SHIP_ESTIMATES, SIZES } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { listingImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "出品を編集する", robots: { index: false, follow: false } };

const COLUMNS =
  "id, status, title, description, category, worn_days, material, color, size, price, stock_mode, opt_photo, opt_letter, opt_ziplock, opt_card, opt_video, opt_extend, max_worn_days, request_only, same_day, anonymous_ok, pre_message_ok, followers_only, cool_shipping, ship_estimate, ng_note, image_paths";

/** DB の文字を、決まった値の一覧の中の物に（無ければ null） */
function pick<T extends string>(list: readonly { value: T }[], v: string | null): T | null {
  return list.find((x) => x.value === v)?.value ?? null;
}

export default async function EditListingPage({ params, searchParams }: PageProps<"/listings/[id]/edit">) {
  const { id } = await params;
  const justSaved = (await searchParams).saved === "draft" ? "draft" : null;
  const viewer = await requireViewer(`/listings/${encodeURIComponent(id)}/edit`);
  if (viewer.role !== "seller") redirect("/mypage");
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [settings, me, res] = await Promise.all([
    getSettings(),
    getMyProfile(),
    supabase.from("listings").select(COLUMNS).eq("id", id).eq("seller_id", viewer.id).maybeSingle(),
  ]);
  if (res.error) console.error("[listings] edit", res.error.message);
  const l = res.data;
  if (!l || l.status === "deleted" || l.status === "hidden") notFound();

  const header = (
    <>
      <SiteHeader variant="form" />
      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="bc-sep">›</span>
        <Link href="/mypage">マイページ</Link>
        <span className="bc-sep">›</span>
        <Link href="/mypage/items">出品管理</Link>
        <span className="bc-sep">›</span>
        <span>出品を編集する</span>
      </div>
    </>
  );

  if (l.status !== "draft" && l.status !== "published" && l.status !== "private") {
    // 売り切れ（sold）など。取引に使われた内容なので、ここでは直せない
    return (
      <div className="pg-item-form">
        {header}
        <main className="layout" style={{ gridTemplateColumns: "1fr" }}>
          <div className="form-section">
            <div className="form-card lf-closed">
              {l.status === "sold" ? "売り切れの出品は編集できません。" : "この出品は今は編集できません。"}
              <br />
              <Link href={`/items/${l.id}`}>商品ページを見る →</Link>
              <br />
              <Link href="/mypage/items">出品管理へ戻る →</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }
  const status = l.status as ListingFormStatus;

  const initial: ListingFormValues = {
    title: l.title ?? "",
    description: l.description ?? "",
    category: pick(CATEGORIES, l.category),
    worn_days: l.worn_days,
    material: pick(MATERIALS, l.material),
    color: pick(COLORS, l.color),
    size: pick(SIZES, l.size),
    price: l.price,
    stock_mode: l.stock_mode === "multiple" ? "multiple" : "single",
    opt_photo: l.opt_photo,
    opt_letter: l.opt_letter,
    opt_ziplock: l.opt_ziplock,
    opt_card: l.opt_card,
    opt_video: l.opt_video,
    opt_extend: l.opt_extend,
    max_worn_days: l.max_worn_days,
    request_only: l.request_only,
    same_day: l.same_day,
    anonymous_ok: l.anonymous_ok,
    pre_message_ok: l.pre_message_ok,
    followers_only: l.followers_only,
    cool_shipping: l.cool_shipping,
    ship_estimate: pick(SHIP_ESTIMATES, l.ship_estimate) ?? "same_next",
    ng_note: l.ng_note ?? "",
  };
  const images = (l.image_paths ?? []).flatMap((path) => {
    const url = listingImage(path);
    return url ? [{ path, url }] : [];
  });

  return (
    <div className="pg-item-form">
      {header}
      <ListingForm
        listingId={l.id}
        status={status}
        initial={initial}
        initialImages={images}
        kycOk={viewer.kycStatus === "approved"}
        feeRate={settings.feeRate}
        anonymousFee={settings.anonymousFee}
        videoFee={settings.videoFee}
        extendFeePerDay={settings.extendFeePerDay}
        sellerName={displayName(me?.public_name ?? viewer.nickname)}
        justSaved={justSaved}
      />
    </div>
  );
}
