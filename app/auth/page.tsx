/* ログイン・新規登録（見本 auth.html）。?tab=register で登録側を開く（?role=seller|buyer で役割を先に選んでおく）。?next= はログインのあとの行き先 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import AuthForms from "@/components/auth/AuthForms";
import AuthHeader from "@/components/auth/AuthHeader";
import { afterLoginPath } from "@/components/auth/rules";
import { getViewer } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import "@/styles/auth.css";
import "@/components/auth/auth-extra.css";

export const metadata: Metadata = {
  title: "ログイン・新規登録",
  robots: { index: false, follow: false },
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AuthPage({ searchParams }: PageProps<"/auth">) {
  const sp = await searchParams;
  const next = afterLoginPath(one(sp.next));
  const tab = one(sp.tab) === "register" ? "register" : "login";
  const roleParam = one(sp.role);
  const initialRole = roleParam === "seller" || roleParam === "buyer" ? roleParam : null;
  const linkError = one(sp.error) === "link";

  // ログイン済みなら、ここには用がない
  const viewer = await getViewer();
  if (viewer) redirect(viewer.status === "active" ? next : "/auth/suspended");

  const settings = await getSettings();

  return (
    <div className="pg-auth">
      <AuthHeader />
      <main className="page">
        <div className="card">
          <AuthForms
            initialTab={tab}
            initialRole={initialRole}
            next={next}
            providers={publicEnv.oauthProviders}
            registrationOpen={settings.registrationOpen}
            linkError={linkError}
          />
        </div>
      </main>
      <SiteFooter variant="auth" />
    </div>
  );
}
