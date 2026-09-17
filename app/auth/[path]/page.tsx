import { AuthView } from "@neondatabase/auth-ui";
import type { Metadata } from "next";
import { CredentialsForm } from "@/components/auth/credentials-form";

export const metadata: Metadata = { title: "Account" };

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;

  if (path === "sign-in" || path === "sign-up") {
    return <CredentialsForm mode={path} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        <AuthView path={path} />
      </section>
    </main>
  );
}
