"use client";
/* server action を呼ぶ小さな道具。押している間は pending、結果の文は message/error に入る */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";

export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run<T>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T | undefined) => void) {
    setError(null);
    setMessage(null);
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (r.message) setMessage(r.message);
          onOk?.(r.data);
        } else {
          setError(r.error);
        }
      } catch (e) {
        // redirect() は投げ直されてここに来ない。通信の失敗など
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("通信に失敗しました。電波の良い所で、もう一度お試しください。");
      }
    });
  }
  return { pending, error, message, run, setError, setMessage };
}

export function FormMessage({ error, message }: { error?: string | null; message?: string | null }) {
  if (error) {
    return (
      <p className="pt-msg error" role="alert">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p className="pt-msg ok" role="status">
        {message}
      </p>
    );
  }
  return null;
}
