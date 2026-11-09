"use client";
/* 管理者が利用者のプロフィールを直す欄（利用者の詳細ページ）。項目は本人の編集画面（components/mypage/ProfileForm）と同じで、
   アイコンは全員、カバー・プロフィール写真と属性は出品者だけ。画像は本人のフォルダへ上げる（adminUploadProfileImage）。
   保存は確認の窓で理由（必須）を書いてから。記録は DB の admin_update_profile が user.profile_edit で残す。
   購入者では出品者だけの項目を出さず、今の値をそのまま送る（DB も購入者の分は書かない）。 */
import { useCallback, useState, useTransition } from "react";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import type { ProfileInitial } from "@/components/mypage/ProfileForm";
import { PROFILE_OPTIONS, type ProfileOption } from "@/components/mypage/ui";
import { adminUpdateProfile, adminUploadProfileImage, type AdminProfileInput } from "@/lib/actions/admin";
import { san } from "@/lib/format";
import { BODY_TYPES, SHIP_ESTIMATES } from "@/lib/labels";
import { toneOf, useFlash } from "./Flash";
import { Modal } from "./Modal";

type BodyType = (typeof BODY_TYPES)[number]["value"];
type ShipEstimate = (typeof SHIP_ESTIMATES)[number]["value"];

/** プロフィール写真の上限（DB の profiles_photo_paths_ok と同じ） */
const PHOTO_MAX = 6;
const REASON_MAX = 500;
const AGES = Array.from({ length: 99 - 18 + 1 }, (_, i) => 18 + i);
const HEIGHTS = Array.from({ length: 200 - 120 + 1 }, (_, i) => 120 + i);

function asBody(v: string | null): BodyType | null {
  return BODY_TYPES.some((b) => b.value === v) ? (v as BodyType) : null;
}
function asShip(v: string | null): ShipEstimate | null {
  return SHIP_ESTIMATES.some((s) => s.value === v) ? (v as ShipEstimate) : null;
}

export default function AdminProfileForm({
  userId,
  userName,
  isSeller,
  initial,
}: {
  userId: string;
  /** 確認の窓の見出しに出す、今の呼び名 */
  userName: string;
  isSeller: boolean;
  initial: ProfileInitial;
}) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [bio, setBio] = useState(initial.bio);
  const [avatar, setAvatar] = useState<UploadedImage[]>(initial.avatar ? [initial.avatar] : []);
  const [cover, setCover] = useState<UploadedImage[]>(initial.cover ? [initial.cover] : []);
  const [photos, setPhotos] = useState<UploadedImage[]>(initial.photos);
  const [age, setAge] = useState(initial.age);
  const [occupation, setOccupation] = useState(initial.occupation);
  const [heightCm, setHeightCm] = useState(initial.heightCm);
  const [bodyType, setBodyType] = useState<BodyType | null>(asBody(initial.bodyType));
  const [shipEstimate, setShipEstimate] = useState<ShipEstimate | null>(asShip(initial.shipEstimate));
  const [options, setOptions] = useState<ProfileOption[]>(
    PROFILE_OPTIONS.map((o) => o.value).filter((v) => initial.supportedOptions.includes(v)),
  );
  const [ngNote, setNgNote] = useState(initial.ngNote);
  const [acceptMessages, setAcceptMessages] = useState(initial.acceptMessages);

  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const flash = useFlash();

  // 上げ口は本人の物ではなく管理者用（対象の人のフォルダへ上げる）
  const upload = useCallback(
    (fd: FormData) => {
      fd.set("userId", userId);
      return adminUploadProfileImage(fd);
    },
    [userId],
  );

  function toggleOption(v: ProfileOption) {
    setOptions((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  function open() {
    const nick = nickname.trim();
    if (!nick || Array.from(nick).length > 20) {
      setFormError("ニックネームは1〜20字で入れてください。");
      return;
    }
    setFormError(null);
    setDialogError(null);
    setConfirming(true);
  }

  const close = useCallback(() => {
    setConfirming(false);
    setDialogError(null);
  }, []);

  function submit() {
    const why = reason.trim();
    if (why === "") {
      setDialogError("直した理由を入力してください。");
      return;
    }
    setDialogError(null);
    const input: AdminProfileInput = {
      nickname: nickname.trim(),
      bio,
      avatar_path: avatar[0]?.path ?? null,
      // 購入者には出品者だけの欄を出していないので、今の値のまま送る
      cover_path: isSeller ? (cover[0]?.path ?? null) : (initial.cover?.path ?? null),
      photo_paths: (isSeller ? photos : initial.photos).map((p) => p.path),
      age,
      occupation: occupation.trim(),
      height_cm: heightCm,
      body_type: bodyType,
      ship_estimate: shipEstimate,
      supported_options: options,
      ng_note: ngNote,
      accept_messages: acceptMessages,
    };
    start(async () => {
      try {
        const r = await adminUpdateProfile(userId, input, why);
        if (r.ok) {
          setConfirming(false);
          setReason("");
          const msg = r.message ?? "プロフィールを直しました。";
          flash(msg, toneOf(msg));
        } else {
          setDialogError(r.error);
        }
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setDialogError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  return (
    <form
      className="adm-form"
      aria-label="プロフィールの編集"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        open();
      }}
    >
      <div className="adm-pf-images">
        <div role="group" aria-label="アイコン">
          <span className="adm-label">アイコン</span>
          <ImageUploader kind="avatar" max={1} value={avatar} onChange={setAvatar} label="アイコンを選ぶ" disabled={pending} upload={upload} />
        </div>
        {isSeller && (
          <div role="group" aria-label="カバー画像">
            <span className="adm-label">カバー画像</span>
            <ImageUploader kind="cover" max={1} value={cover} onChange={setCover} label="カバー画像を選ぶ" disabled={pending} upload={upload} />
          </div>
        )}
        {isSeller && (
          <div role="group" aria-label="プロフィール写真">
            <span className="adm-label">プロフィール写真（{PHOTO_MAX}枚まで）</span>
            <ImageUploader kind="photo" max={PHOTO_MAX} value={photos} onChange={setPhotos} label="写真を選ぶ" disabled={pending} upload={upload} />
          </div>
        )}
      </div>

      <div>
        <label className="adm-label" htmlFor="apf-nickname">
          ニックネーム（必須・20字まで）
        </label>
        <input
          id="apf-nickname"
          className="adm-input"
          type="text"
          maxLength={20}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          autoComplete="off"
          disabled={pending}
        />
      </div>
      <div>
        <label className="adm-label" htmlFor="apf-bio">
          自己紹介
        </label>
        <textarea id="apf-bio" className="adm-textarea" maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} disabled={pending} />
        <div className="adm-hint">{Array.from(bio).length} / 1000文字</div>
      </div>

      {isSeller && (
        <>
          <div className="adm-pf-grid">
            <div>
              <label className="adm-label" htmlFor="apf-age">
                年齢
              </label>
              <select
                id="apf-age"
                className="adm-select"
                value={age ?? ""}
                onChange={(e) => setAge(e.target.value ? Number(e.target.value) : null)}
                disabled={pending}
              >
                <option value="">出さない</option>
                {AGES.map((a) => (
                  <option key={a} value={a}>
                    {a}歳
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="adm-label" htmlFor="apf-occupation">
                職業
              </label>
              <input
                id="apf-occupation"
                className="adm-input"
                type="text"
                maxLength={20}
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className="adm-label" htmlFor="apf-height">
                身長
              </label>
              <select
                id="apf-height"
                className="adm-select"
                value={heightCm ?? ""}
                onChange={(e) => setHeightCm(e.target.value ? Number(e.target.value) : null)}
                disabled={pending}
              >
                <option value="">出さない</option>
                {HEIGHTS.map((h) => (
                  <option key={h} value={h}>
                    {h}cm
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="adm-label" htmlFor="apf-body">
                体型
              </label>
              <select
                id="apf-body"
                className="adm-select"
                value={bodyType ?? ""}
                onChange={(e) => setBodyType(asBody(e.target.value || null))}
                disabled={pending}
              >
                <option value="">出さない</option>
                {BODY_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="adm-label" htmlFor="apf-ship">
                発送目安
              </label>
              <select
                id="apf-ship"
                className="adm-select"
                value={shipEstimate ?? ""}
                onChange={(e) => setShipEstimate(asShip(e.target.value || null))}
                disabled={pending}
              >
                <option value="">出さない</option>
                {SHIP_ESTIMATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className="adm-label">対応できるオプション</span>
            <div className="adm-chips" role="group" aria-label="対応できるオプション">
              {PROFILE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="adm-chip"
                  aria-pressed={options.includes(o.value)}
                  onClick={() => toggleOption(o.value)}
                  disabled={pending}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="adm-label" htmlFor="apf-ng">
              NG・注意事項
            </label>
            <textarea id="apf-ng" className="adm-textarea" maxLength={200} value={ngNote} onChange={(e) => setNgNote(e.target.value)} disabled={pending} />
            <div className="adm-hint">{Array.from(ngNote).length} / 200文字</div>
          </div>
          <label className="adm-check">
            <input type="checkbox" checked={acceptMessages} onChange={(e) => setAcceptMessages(e.target.checked)} disabled={pending} />
            メッセージを受け付ける
          </label>
        </>
      )}

      {formError && (
        <p className="adm-msg error" role="alert">
          {formError}
        </p>
      )}
      <div>
        <button type="submit" className="adm-save" disabled={pending}>
          プロフィールを保存する
        </button>
      </div>

      {confirming && (
        <Modal
          title={
            <>
              {/* 名前は最大20字で1行に入らないことがあるので折ってよい。後ろは語の途中で割らない */}
              {san(userName)}の<span className="adm-nowrap">プロフィールを直しますか？</span>
            </>
          }
          onClose={close}
          busy={pending}
        >
          <p className="adm-pre">{"本人の画面と公開のページにすぐ出ます。\n本人には知らせません。\n直した理由は操作の記録に残ります。"}</p>
          <div>
            <label className="adm-label" htmlFor="apf-reason">
              直した理由（必須）
            </label>
            <textarea
              id="apf-reason"
              className="adm-textarea"
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
            <div className="adm-hint">
              {Array.from(reason).length} / {REASON_MAX}文字
            </div>
          </div>
          {dialogError && (
            <p className="adm-msg error" role="alert">
              {dialogError}
            </p>
          )}
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn" onClick={close} disabled={pending}>
              やめる
            </button>
            <button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>
              {pending ? "送信中…" : "直す"}
            </button>
          </div>
        </Modal>
      )}
    </form>
  );
}
