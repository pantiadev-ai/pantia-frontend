/* 対応オプションの決まり（1か所）。
   出品者のページの「対応オプション」・商品のページの札・購入の欄が、同じ物を出すために使う。
   プロフィールの値（profiles.supported_options）と、出品の印（listings.opt_* など）を同じ名前にそろえる。
   2026-11-09 に運営から「購入者から見ると、オプションが入っている所と入っていない所があった」 */

/** 出す順（プロフィールの順のあとに、出品にしか無い物） */
export const OPTION_ORDER = ["photo", "days", "same_day", "anonymous", "letter", "request", "bundle", "video", "ziplock", "card"] as const;
export type OptionKey = (typeof OPTION_ORDER)[number];

/** プロフィールの物は components/mypage/ui.ts の PROFILE_OPTIONS と、出品にしか無い物は出品の入力の画面と同じ名前 */
export const OPTION_LABELS: Record<OptionKey, { icon: string; label: string }> = {
  photo: { icon: "📸", label: "着用写真" },
  days: { icon: "📅", label: "着用日数の相談" },
  same_day: { icon: "⚡", label: "即日発送" },
  anonymous: { icon: "📦", label: "匿名配送" },
  letter: { icon: "💌", label: "手紙" },
  request: { icon: "🎀", label: "リクエスト対応" },
  bundle: { icon: "🛍", label: "まとめ買い" },
  video: { icon: "🎬", label: "着用動画" },
  ziplock: { icon: "🧴", label: "ジップロック梱包" },
  card: { icon: "✉️", label: "メッセージカード" },
};

export function optionLabel(k: OptionKey): string {
  return `${OPTION_LABELS[k].icon} ${OPTION_LABELS[k].label}`;
}

/** 出品の印（lib/catalogue.ts の ListingDetail と同じ名前）。
    request_only（リクエストを受けた人だけが買える）は購入の制限で、対応オプションではないので入れない */
export type ListingOptionFlags = {
  optPhoto: boolean;
  optExtend: boolean;
  sameDay: boolean;
  anonymousOk: boolean;
  optLetter: boolean;
  optVideo: boolean;
  optZiplock: boolean;
  optCard: boolean;
};

const FROM_LISTING: [keyof ListingOptionFlags, OptionKey][] = [
  ["optPhoto", "photo"],
  ["optExtend", "days"],
  ["sameDay", "same_day"],
  ["anonymousOk", "anonymous"],
  ["optLetter", "letter"],
  ["optVideo", "video"],
  ["optZiplock", "ziplock"],
  ["optCard", "card"],
];

function ordered(keys: Set<OptionKey>): OptionKey[] {
  return OPTION_ORDER.filter((k) => keys.has(k));
}

/** 1つの出品で選ばれている対応オプション */
export function listingOptionKeys(l: ListingOptionFlags): OptionKey[] {
  return ordered(new Set(FROM_LISTING.filter(([f]) => l[f]).map(([, k]) => k)));
}

/** 出品者のページ: プロフィールで選んだ物に、公開中の出品で選ばれている物を足す（知らない値は出さない） */
export function sellerOptionKeys(profile: readonly string[], listings: readonly ListingOptionFlags[]): OptionKey[] {
  const keys = new Set<OptionKey>();
  for (const v of profile) if ((OPTION_ORDER as readonly string[]).includes(v)) keys.add(v as OptionKey);
  for (const l of listings) for (const k of listingOptionKeys(l)) keys.add(k);
  return ordered(keys);
}

/** 選ばなくても付いてくる物（購入の欄の「付いてくる物」） */
const INCLUDED: readonly OptionKey[] = ["ziplock", "card"];

export function includedOptionKeys(l: ListingOptionFlags): OptionKey[] {
  return listingOptionKeys(l).filter((k) => INCLUDED.includes(k));
}
