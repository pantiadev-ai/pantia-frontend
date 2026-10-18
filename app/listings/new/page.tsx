/* 新しく出品する（見本 item_form.html）。出品者だけ。保存すると URL は /listings/<id>/edit に替わる */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "@/styles/item-form.css";
import "@/components/listings/listing-form.css";
import SiteHeader from "@/components/SiteHeader";
import ListingForm, { type ListingFormValues } from "@/components/listings/ListingForm";
import { getMyProfile } from "@/components/mypage/data";
import { requireViewer } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { SHIP_ESTIMATES } from "@/lib/labels";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "商品を出品する", robots: { index: false, follow: false } };

export default async function NewListingPage() {
  const viewer = await requireViewer("/listings/new");
  if (viewer.role !== "seller") redirect("/mypage");

  const [settings, me] = await Promise.all([getSettings(), getMyProfile()]);

  // はじめの値は DB の既定値。発送目安と匿名配送は、プロフィールの設定があればそれに合わせる
  const ship = SHIP_ESTIMATES.find((s) => s.value === me?.ship_estimate)?.value ?? "same_next";
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
    anonymous_ok: (me?.supported_options ?? []).includes("anonymous"),
    pre_message_ok: true,
    followers_only: false,
    cool_shipping: false,
    ship_estimate: ship,
    ng_note: "",
  };

  return (
    <div className="pg-item-form">
      <SiteHeader variant="form" />

      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="bc-sep">›</span>
        <Link href="/mypage">マイページ</Link>
        <span className="bc-sep">›</span>
        <span>商品を出品する</span>
      </div>

      <ListingForm
        listingId={null}
        status={null}
        initial={initial}
        initialImages={[]}
        kycOk={viewer.kycStatus === "approved"}
        feeRate={settings.feeRate}
        anonymousFee={settings.anonymousFee}
        videoFee={settings.videoFee}
        extendFeePerDay={settings.extendFeePerDay}
        sellerName={displayName(me?.public_name ?? viewer.nickname)}
      />
    </div>
  );
}
