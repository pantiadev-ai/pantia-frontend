"use client";
/* 操作の結果の知らせ（画面の右下）。操作した行が一覧から消えても（例: 振込済みにした申請）文が残るよう、
   行の部品ではなく外枠に置く。注意つきの文（「ただし…」）は自動では消さない。
   中身は app/admin/layout の FlashProvider が持ち、見た目は各ページの AdminShell の FlashToasts が描く。
   layout は別のページへ移っても作り直されないので、移った先でも知らせが残る（例: 代理登録のあと詳しい画面へ）。 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type FlashTone = "ok" | "warn" | "error";
type Item = { id: number; tone: FlashTone; text: string };

const FlashContext = createContext<(text: string, tone?: FlashTone) => void>(() => {});
const ItemsContext = createContext<{ items: Item[]; close: (id: number) => void }>({ items: [], close: () => {} });

export function useFlash() {
  return useContext(FlashContext);
}

/** 結果の文の言い方から、知らせの色を決める */
export function toneOf(message: string): FlashTone {
  return message.includes("ただし") ? "warn" : "ok";
}

export function FlashProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);

  const close = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (text: string, tone: FlashTone = "ok") => {
      seq.current += 1;
      const id = seq.current;
      setItems((xs) => [...xs.slice(-2), { id, tone, text }]);
      if (tone === "ok") setTimeout(() => close(id), 6000);
    },
    [close],
  );

  return (
    <FlashContext.Provider value={show}>
      <ItemsContext.Provider value={{ items, close }}>{children}</ItemsContext.Provider>
    </FlashContext.Provider>
  );
}

/** 知らせの並び。色の値は .pg-admin が持つので、AdminShell の中に置く */
export function FlashToasts() {
  const { items, close } = useContext(ItemsContext);
  return (
    <div className="adm-toasts" role="status" aria-live="polite">
      {items.map((x) => (
        <div key={x.id} className={`adm-toast ${x.tone}`}>
          <span>{x.text}</span>
          <button type="button" onClick={() => close(x.id)} aria-label="閉じる">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
