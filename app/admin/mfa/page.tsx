/* 管理画面の二段階認証（認証アプリ・TOTP）。管理画面の中でここだけは aal1 で入れる（ここで aal2 に上げる）。
   ・管理者でなければ 404（requireAdmin の中で notFound）。
   ・もう aal2 なら /admin へ。
   ・確認済みの認証アプリが無ければ登録から、あれば6桁のコードを入れるだけ。
   外枠（メニュー）は出さない（まだ二段階認証が済んでいないので、件数なども見せない）。 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MfaForm from "@/components/admin/MfaForm";
import { isAal2 } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "二段階認証" };

export default async function AdminMfaPage() {
  await requireAdmin();
  if (await isAal2()) redirect("/admin");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) console.error("[admin] mfa listFactors", error.message);
  const factor = (data?.totp ?? []).find((f) => f.status === "verified");

  return (
    <div className="pg-admin">
      <main className="adm-center">
        <div className="chart-card">
          <div className="card-header">
            <div className="card-title">
              <span className="pill pill-pk" aria-hidden="true">
                🔐
              </span>{" "}
              二段階認証
            </div>
          </div>
          {error ? (
            <p className="adm-msg error" role="alert">
              認証の情報を読めませんでした。時間をおいて読み込み直してください。
            </p>
          ) : (
            <MfaForm mode={factor ? "verify" : "enroll"} factorId={factor?.id} />
          )}
          <p className="adm-hint" style={{ marginTop: 14 }}>
            スマホを失くして認証アプリが使えないときは、ほかの管理者か、サーバーの担当者に二段階認証の登録を消してもらってください。
          </p>
        </div>
      </main>
    </div>
  );
}
