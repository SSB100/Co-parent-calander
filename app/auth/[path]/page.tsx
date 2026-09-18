import { AuthView } from "@neondatabase/auth-ui";
import type { Metadata } from "next";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { normalizeInviteCode } from "@/lib/security/invites";

export const metadata: Metadata = { title: "Account" };

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const inviteCode = query.invite ? normalizeInviteCode(query.invite) : "";

  if (path === "sign-in" || path === "sign-up") {
    return <CredentialsForm mode={path} inviteCode={inviteCode} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        <AuthView path={path} />
      </section>
    </main>
  );
}
