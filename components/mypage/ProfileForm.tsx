"use client";
/* プロフィールの編集。アイコン・ニックネーム・紹介文は全員、カバーと属性（年齢・職業など）は出品者だけ */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import { useAction, FormMessage } from "@/components/useAction";
import { updateProfile, type ProfileInput } from "@/lib/actions/profile";
import { BODY_TYPES, SHIP_ESTIMATES } from "@/lib/labels";
import { PROFILE_OPTIONS, type ProfileOption } from "./ui";

type BodyType = (typeof BODY_TYPES)[number]["value"];
type ShipEstimate = (typeof SHIP_ESTIMATES)[number]["value"];

export type ProfileInitial = {
  nickname: string;
  bio: string;
  avatar: UploadedImage | null;
  cover: UploadedImage | null;
  age: number | null;
  occupation: string;
  heightCm: number | null;
  bodyType: string | null;
  shipEstimate: string | null;
  supportedOptions: string[];
  ngNote: string;
  acceptMessages: boolean;
};

const AGES = Array.from({ length: 99 - 18 + 1 }, (_, i) => 18 + i);
const HEIGHTS = Array.from({ length: 200 - 120 + 1 }, (_, i) => 120 + i);

function asBody(v: string | null): BodyType | null {
  return BODY_TYPES.some((b) => b.value === v) ? (v as BodyType) : null;
}
function asShip(v: string | null): ShipEstimate | null {
  return SHIP_ESTIMATES.some((s) => s.value === v) ? (v as ShipEstimate) : null;
}

export default function ProfileForm({ isSeller, initial }: { isSeller: boolean; initial: ProfileInitial }) {
  const router = useRouter();
  const { pending, error, message, run, setError } = useAction();

  const [nickname, setNickname] = useState(initial.nickname);
  const [bio, setBio] = useState(initial.bio);
  const [avatar, setAvatar] = useState<UploadedImage[]>(initial.avatar ? [initial.avatar] : []);
  const [cover, setCover] = useState<UploadedImage[]>(initial.cover ? [initial.cover] : []);
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

  function toggleOption(v: ProfileOption) {
    setOptions((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    if (!nick || Array.from(nick).length > 20) {
      setError("ニックネームは1〜20字で入れてください。");
      return;
    }
    const base = { nickname: nick, bio, avatar_path: avatar[0]?.path ?? null };
    const input: ProfileInput = isSeller
      ? {
          ...base,
          cover_path: cover[0]?.path ?? null,
          age,
          occupation: occupation.trim() || null,
          height_cm: heightCm,
          body_type: bodyType,
          ship_estimate: shipEstimate,
          supported_options: options,
          ng_note: ngNote,
          accept_messages: acceptMessages,
        }
      : base;
    run(
      () => updateProfile(input),
      () => router.refresh(),
    );
  }

  return (
    <form className="mp-form" onSubmit={submit} noValidate>
      <div className="settings-section">
        <div className="settings-title">
          <span className="icon-pill">🌸</span> 基本の情報
        </div>
        <div className="mp-form">
          <div className="mp-field">
            <span className="mp-label">アイコン</span>
            <ImageUploader kind="avatar" max={1} value={avatar} onChange={setAvatar} label="アイコンを選ぶ" disabled={pending} />
            <span className="mp-hint">顔や個人情報が分かる写真は使わないでください。</span>
          </div>
          {isSeller && (
            <div className="mp-field">
              <span className="mp-label">カバー画像</span>
              <ImageUploader kind="cover" max={1} value={cover} onChange={setCover} label="カバー画像を選ぶ" disabled={pending} />
              <span className="mp-hint">プロフィールの上に横長で出ます。</span>
            </div>
          )}
          <div className="mp-field">
            <label className="mp-label" htmlFor="pf-nickname">
              ニックネーム<span className="mp-req">必須</span>
            </label>
            <input
              id="pf-nickname"
              className="mp-input"
              type="text"
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="nickname"
              required
            />
            <span className="mp-hint">{Array.from(nickname).length}/20字。本名は入れないでください。</span>
          </div>
          <div className="mp-field">
            <label className="mp-label" htmlFor="pf-bio">
              自己紹介
            </label>
            <textarea id="pf-bio" className="mp-textarea" maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} />
            <span className="mp-hint">{Array.from(bio).length}/1000字。連絡先（SNS・メールなど）は書かないでください。</span>
          </div>
        </div>
      </div>

      {isSeller && (
        <div className="settings-section">
          <div className="settings-title">
            <span className="icon-pill">🎀</span> 出品者のプロフィール
          </div>
          <div className="mp-form">
            <div className="mp-row">
              <div className="mp-field">
                <label className="mp-label" htmlFor="pf-age">
                  年齢
                </label>
                <select
                  id="pf-age"
                  className="mp-select"
                  value={age ?? ""}
                  onChange={(e) => setAge(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">出さない</option>
                  {AGES.map((a) => (
                    <option key={a} value={a}>
                      {a}歳
                    </option>
                  ))}
                </select>
              </div>
              <div className="mp-field">
                <label className="mp-label" htmlFor="pf-occupation">
                  職業
                </label>
                <input
                  id="pf-occupation"
                  className="mp-input"
                  type="text"
                  maxLength={20}
                  placeholder="例：OL・学生"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                />
              </div>
              <div className="mp-field">
                <label className="mp-label" htmlFor="pf-height">
                  身長
                </label>
                <select
                  id="pf-height"
                  className="mp-select"
                  value={heightCm ?? ""}
                  onChange={(e) => setHeightCm(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">出さない</option>
                  {HEIGHTS.map((h) => (
                    <option key={h} value={h}>
                      {h}cm
                    </option>
                  ))}
                </select>
              </div>
              <div className="mp-field">
                <label className="mp-label" htmlFor="pf-body">
                  体型
                </label>
                <select
                  id="pf-body"
                  className="mp-select"
                  value={bodyType ?? ""}
                  onChange={(e) => setBodyType(asBody(e.target.value || null))}
                >
                  <option value="">出さない</option>
                  {BODY_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mp-field">
              <label className="mp-label" htmlFor="pf-ship">
                発送目安
              </label>
              <select
                id="pf-ship"
                className="mp-select"
                value={shipEstimate ?? ""}
                onChange={(e) => setShipEstimate(asShip(e.target.value || null))}
              >
                <option value="">出さない</option>
                {SHIP_ESTIMATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mp-field">
              <span className="mp-label">対応できるオプション</span>
              <div className="mp-chips" role="group" aria-label="対応できるオプション">
                {PROFILE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`mp-chip${options.includes(o.value) ? " selected" : ""}`}
                    aria-pressed={options.includes(o.value)}
                    onClick={() => toggleOption(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mp-field">
              <label className="mp-label" htmlFor="pf-ng">
                NG・注意事項
              </label>
              <textarea
                id="pf-ng"
                className="mp-textarea"
                style={{ minHeight: 70 }}
                maxLength={200}
                placeholder="例：顔写真はお断りしています。"
                value={ngNote}
                onChange={(e) => setNgNote(e.target.value)}
              />
              <span className="mp-hint">{Array.from(ngNote).length}/200字</span>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">💬 メッセージを受け付ける</div>
                <div className="setting-desc">オフにすると、購入者から新しくメッセージを始められなくなります。</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={acceptMessages}
                  onChange={(e) => setAcceptMessages(e.target.checked)}
                  aria-label="メッセージを受け付ける"
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      )}

      <FormMessage error={error} message={message} />
      <div className="mp-actions">
        <button type="submit" className="mp-btn primary" disabled={pending}>
          {pending ? "保存しています…" : "保存する"}
        </button>
      </div>
    </form>
  );
}
