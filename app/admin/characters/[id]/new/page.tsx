/* キャラ（運営で入れた売手）の名前で新しく出品する。見た目はふつうの出品の画面（/listings/new）と同じ。
   キャラの印が無い人・売手でない人・見つからない人は 404。
   保存は管理画面の server action（saveCharacterListing）で、出品者はキャラ。管理者の名前は出ない。
   作ったあとは、そのキャラの出品の一覧（/admin/items?seller=）へ移る。編集はキャラでログインして行う。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/styles/item-form.css";
import "@/components/listings/listing-form.css";
import CharacterListingForm from "@/components/admin/CharacterListingForm";
import type { ListingFormValues } from "@/components/listings/ListingForm";
import { requireAdminPage } from "@/lib/admin";
import { displayName } from "@/lib/format";
import { SHIP_ESTIMATES } from "@/lib/labels";
import { isUuid } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "キャラの名前で出品する" };

export default async function AdminCharacterNewListingPage({ params }: PageProps<"/admin/characters/[id]/new">) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const service = createServiceClient();
  const [mark, prof, settings] = await Promise.all([
    service.from("character_accounts").select("user_id").eq("user_id", id).maybeSingle(),
    service
      .from("profiles")
      .select("id, nickname, public_name, role, status, kyc_status, ship_estimate, supported_options")
      .eq("id", id)
      .maybeSingle(),
    getSettings(),
  ]);
  if (mark.error) console.error("[admin] character mark", mark.error.message);
  if (prof.error) console.error("[admin] character profile", prof.error.message);
  const p = prof.data;
  if (!mark.data || !p || p.role !== "seller") notFound();

  // はじめの値は /listings/new と同じ（DB の既定値。発送目安と匿名配送はキャラのプロフィールの設定に合わせる）
  const ship = SHIP_ESTIMATES.find((s) => s.value === p.ship_estimate)?.value ?? "same_next";
  const initial: ListingFormValues = {
    title: "",
    description: "",
    category: null,
    worn_days: null,
    material: null,
    color: null,
    size: null,
    price: null,
    stock_mode: "single",
    opt_photo: true,
    opt_letter: true,
    opt_ziplock: false,
    opt_card: false,
    opt_video: false,
    opt_extend: false,
    max_worn_days: null,
    request_only: false,
    same_day: ship === "same_next",
    anonymous_ok: (p.supported_options ?? []).includes("anonymous"),
    pre_message_ok: true,
    followers_only: false,
    cool_shipping: false,
    ship_estimate: ship,
    ng_note: "",
    paid_options: [],
  };
  const name = displayName(p.public_name ?? p.nickname);
  // 公開できるのは seller_is_public と同じ条件（売手・利用中・本人確認済み）。DB の側でも確かめる
  const canPublish = p.status === "active" && p.kyc_status === "approved";

  return (
    <div className="pg-item-form">
      <div className="breadcrumb">
        <Link href="/admin">管理画面</Link>
        <span className="bc-sep">›</span>
        <Link href="/admin/characters">キャラ</Link>
        <span className="bc-sep">›</span>
        <span>出品する</span>
      </div>

      <div className="adm-chara-banner" role="note">
        <span aria-hidden="true">🎭</span>
        <div>
          <strong>{name}</strong>
          <p>このキャラの名前で出品します。商品ページには、このキャラの名前が出ます（管理者の名前は出ません）。</p>
          <p>
            作ったあとの編集・非公開・削除と、メッセージ・発送は、キャラでログインして行います。{" "}
            <Link href={`/admin/users/${id}`}>ユーザーの詳細へ</Link>
          </p>
        </div>
      </div>

      <CharacterListingForm
        characterId={id}
        initial={initial}
        kycOk={canPublish}
        feeRate={settings.feeRate}
        anonymousFee={settings.anonymousFee}
        videoFee={settings.videoFee}
        extendFeePerDay={settings.extendFeePerDay}
        sellerName={name}
      />
    </div>
  );
}
