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
  searchParams: Promise<{ invite?: string; verify?: string }>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const inviteCode = query.invite ? normalizeInviteCode(query.invite) : "";

  if (path === "sign-in" || path === "sign-up") {
    return (
      <CredentialsForm
        mode={path}
        inviteCode={inviteCode}
        verificationNotice={path === "sign-in" && query.verify === "1"}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFF9F2] px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-xl border-2 border-[#243139] bg-white p-4 shadow-[8px_8px_0_#765ED6] sm:p-6">
        <AuthView path={path} />
      </section>
    </main>
  );
}
