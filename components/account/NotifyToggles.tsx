"use client";
/* 通知の設定。押したらすぐ見た目を変え、保存に失敗したら元に戻す */
import { useState } from "react";
import { setNotify } from "@/lib/actions/account";
import type { NotifyItem, NotifyKey } from "@/components/account/options";

export default function NotifyToggles({ items, initial }: { items: NotifyItem[]; initial: Partial<Record<NotifyKey, boolean>> }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<NotifyKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: NotifyKey, on: boolean) {
    setError(null);
    setState((s) => ({ ...s, [key]: on }));
    setBusy(key);
    try {
      const r = await setNotify(key, on);
      if (!r.ok) {
        setState((s) => ({ ...s, [key]: !on }));
        setError(r.error);
      }
    } catch {
      setState((s) => ({ ...s, [key]: !on }));
      setError("通信に失敗しました。電波の良い所で、もう一度お試しください。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {items.map((it) => (
        <div className="setting-row" key={it.key}>
          <div className="setting-info">
            <div className="setting-name" id={`acc-${it.key}`}>
              {it.name}
            </div>
            <div className="setting-desc">{it.desc}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              aria-labelledby={`acc-${it.key}`}
              checked={state[it.key] ?? false}
              disabled={busy !== null}
              onChange={(e) => void toggle(it.key, e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      ))}
      {error && (
        <p className="pt-msg error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
