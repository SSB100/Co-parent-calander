import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { timesheetsTokenSchema } from "@/lib/timesheets/service";
import { TimesheetsInvitationForm } from "./invitation-form";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join Timesheets", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function TimesheetsInvitationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ verify?: string }> }) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  if (!timesheetsTokenSchema.safeParse(token).success) notFound();
  const { data: session } = await auth.getSession();
  let email: string | null = null, verified = false;
  if (session?.user) {
    // Current own profile only. Never reveal target organisation/staff details
    // to a bearer of the link before verified-email redemption.
    const rows = await getSql()`SELECT email,"emailVerified" FROM neon_auth."user" WHERE id=${session.user.id}::uuid`;
    email = rows[0]?.email ?? session.user.email;
    verified = rows[0]?.emailVerified === true;
  }
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-12"><section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold">Join Covie Timesheets</h1><TimesheetsInvitationForm token={token} email={email} verified={verified} verificationRequested={query.verify === "1"} /></section></main>;
}
