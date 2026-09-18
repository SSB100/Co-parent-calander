import { ArrowRight, Link2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { CovieBrand } from "@/components/workspace/covie-brand";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: session } = await auth.getSession();
  if (session?.user) {
    const calendar = await getCalendarSession();
    redirect(calendar ? "/calendar" : "/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <nav className="flex items-center justify-between" aria-label="Main navigation">
        <CovieBrand />
        <Link href="/auth/sign-in" className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">
          Log in
        </Link>
      </nav>

      <section className="flex flex-1 items-center py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Shared schedules, kept simple</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-7xl">
            One calendar.<br />Both parents in sync.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            Plan parenting days, handovers and family events together. Create a calendar, share its private code and decide whether the other person can edit or view.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/auth/sign-up" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white hover:bg-slate-800">
              Create an account <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/auth/sign-in" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Log in
            </Link>
          </div>

          <div className="mt-12 grid max-w-2xl gap-3 sm:grid-cols-2">
            <div className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4">
              <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <p className="text-sm leading-6 text-slate-600"><strong className="block text-slate-900">Join with a code</strong>No complicated setup or public link.</p>
            </div>
            <div className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
              <p className="text-sm leading-6 text-slate-600"><strong className="block text-slate-900">You control access</strong>Choose editing or view-only permission.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
