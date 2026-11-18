"use client";
/* キャラ（運営で入れた売手）の名前で出品するフォーム。中身はふつうの出品のフォーム（ListingForm）。
   サーバーの画面から関数は渡せないので、保存と写真の上げ口はここで管理画面の server action に差し替える。
   作れるのは1回だけ。作ったあとは、そのキャラの出品の一覧（/admin/items?seller=）へ移る。
   編集・非公開・削除は、運営がキャラでログインして、ふつうの売手の道で行う。 */
import { useCallback, type ComponentProps } from "react";
import ListingForm from "@/components/listings/ListingForm";
import { adminUploadCharacterImage, saveCharacterListing } from "@/lib/actions/admin";
import type { ListingInput } from "@/lib/actions/listings";

type FormProps = ComponentProps<typeof ListingForm>;

export default function CharacterListingForm({
  characterId,
  initial,
  kycOk,
  feeRate,
  anonymousFee,
  videoFee,
  extendFeePerDay,
  sellerName,
}: { characterId: string } & Pick<
  FormProps,
  "initial" | "kycOk" | "feeRate" | "anonymousFee" | "videoFee" | "extendFeePerDay" | "sellerName"
>) {
  const save = useCallback(
    (input: ListingInput, intent: "draft" | "publish") => saveCharacterListing(characterId, input, intent),
    [characterId],
  );
  const upload = useCallback(
    (fd: FormData) => {
      fd.set("userId", characterId);
      return adminUploadCharacterImage(fd);
    },
    [characterId],
  );
  const doneHref = useCallback(() => `/admin/items?seller=${characterId}`, [characterId]);

  return (
    <ListingForm
      listingId={null}
      status={null}
      initial={initial}
      initialImages={[]}
      kycOk={kycOk}
      feeRate={feeRate}
      anonymousFee={anonymousFee}
      videoFee={videoFee}
      extendFeePerDay={extendFeePerDay}
      sellerName={sellerName}
      save={save}
      upload={upload}
      doneHref={doneHref}
    />
  );
}
