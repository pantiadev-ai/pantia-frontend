/* server action の結果の形。画面（クライアント）からも読むので、ここには何も import しない */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
