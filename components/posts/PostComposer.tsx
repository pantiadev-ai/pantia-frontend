"use client";
/* つぶやきの投稿欄（見本 tweets.html の composer）。/tweets・/timeline・/mypage/tweets で使う。
   本文（DB の上限140字）・画像（4枚まで）・商品の紐づけ。投稿したら欄を空にして画面を読み直す。
   出品者でない・本人確認の前などは、action が返した文をそのまま出す。 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import { FormMessage, useAction } from "@/components/useAction";
import { createPost } from "@/lib/actions/posts";

export type PostComposerProps = {
  /** 紐づけられる自分の出品（公開中のもの） */
  listings: { id: string; title: string }[];
  /** 見本のクラスに合わせるときの囲いのクラス（composer に足す） */
  className?: string;
};

const MAX = 140;
const WARN = 120;

export default function PostComposer({ listings, className }: PostComposerProps) {
  const router = useRouter();
  const { pending, error, message, run } = useAction();
  const [text, setText] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [listingId, setListingId] = useState("");
  const [showImages, setShowImages] = useState(false);
  const [showListing, setShowListing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const count = Array.from(text).length;
  const empty = text.trim() === "";
  const over = count > MAX;

  function addHashtag() {
    setText((t) => (t === "" || /\s$/.test(t) ? `${t}#` : `${t} #`));
    area.current?.focus();
  }

  function submit() {
    if (empty || over || pending) return;
    run(
      () => createPost({ body: text, imagePaths: images.map((i) => i.path), listingId: listingId || null }),
      () => {
        setText("");
        setImages([]);
        setListingId("");
        setShowImages(false);
        setShowListing(false);
        router.refresh();
      },
    );
  }

  return (
    <div className={`composer${className ? ` ${className}` : ""}`}>
      <div className="composer-top">
        <div className="comp-avatar" aria-hidden="true">
          ✏️
        </div>
        <textarea
          ref={area}
          className="comp-textarea"
          placeholder="今日のことをつぶやいてみよう🌸 出品のお知らせ、日常のひとことなど気軽に投稿してね"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          aria-label="つぶやきの本文"
          disabled={pending}
        />
      </div>

      {(showImages || images.length > 0) && (
        <div className="comp-img-preview">
          <ImageUploader kind="post" value={images} onChange={setImages} max={4} disabled={pending} label="写真を追加" />
        </div>
      )}

      {showListing && (
        <div className="pp-comp-listing">
          {listings.length === 0 ? (
            <p className="pp-note">紐づけられる公開中の出品がありません。</p>
          ) : (
            <select
              className="pp-select"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              aria-label="紐づける商品"
              disabled={pending}
            >
              <option value="">商品を紐づけない</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="comp-footer">
        <div className="comp-tools">
          <button
            type="button"
            className={`comp-tool${showImages || images.length > 0 ? " on" : ""}`}
            title="画像を追加"
            aria-label="画像を追加"
            onClick={() => setShowImages((s) => !s || images.length > 0)}
          >
            🖼
          </button>
          <button
            type="button"
            className={`comp-tool${showListing || listingId ? " on" : ""}`}
            title="商品を添付"
            aria-label="商品を添付"
            onClick={() => setShowListing((s) => !s || listingId !== "")}
          >
            🛍
          </button>
          <button type="button" className="comp-tool" title="ハッシュタグ" aria-label="ハッシュタグ" onClick={addHashtag}>
            ＃
          </button>
        </div>
        <div className="comp-right">
          <span className={`comp-count${over ? " over" : count > WARN ? " warn" : ""}`} aria-live="polite">
            {count}/{MAX}
          </span>
          <button type="button" className="btn-post" onClick={submit} disabled={empty || over || pending}>
            {pending ? "送信中…" : "つぶやく"}
          </button>
        </div>
      </div>
      <FormMessage error={error} message={message} />
    </div>
  );
}
