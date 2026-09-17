import { CalendarDays, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateCalendarForm, JoinCalendarForm } from "@/components/dashboard/dashboard-forms";
import { InstallApp } from "@/components/pwa/install-app";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { claimLegacyCalendarForCurrentUser } from "@/lib/security/session";
import { openCalendar, signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your calendars" };

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  await claimLegacyCalendarForCurrentUser();
  const sql = getSql();
  const calendars = (await sql`
    SELECT calendar.id, calendar.name, membership.permission, participant.display_name
    FROM calendar_memberships membership
    JOIN calendars calendar ON calendar.id = membership.calendar_id
    LEFT JOIN participants participant ON participant.id = membership.participant_id
    WHERE membership.user_id = ${session.user.id}
    ORDER BY membership.created_at ASC
  `) as Array<{ id: string; name: string; permission: "owner" | "editor" | "viewer"; display_name: string | null }>;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <header className="flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span>
          <div><p className="text-sm font-semibold text-slate-950">Co-parent Calendar</p><p className="text-xs text-slate-500">{session.user.email}</p></div>
        </div>
        <form action={signOut}><button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-950"><LogOut className="h-4 w-4" aria-hidden="true" />Log out</button></form>
      </header>

      <section className="mt-12">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Your calendars</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">Hello, {session.user.name}</h1>
        {calendars.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {calendars.map((calendar) => (
              <form action={openCalendar} key={calendar.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <input type="hidden" name="calendarId" value={calendar.id} />
                <div className="flex items-start justify-between gap-4">
                  <div><h2 className="text-lg font-semibold text-slate-950">{calendar.name}</h2><p className="mt-1 text-sm text-slate-500">{calendar.display_name ?? "View-only member"}</p></div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{calendar.permission}</span>
                </div>
                <button className="mt-5 min-h-11 w-full rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">Open calendar</button>
              </form>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">Create your first calendar or join one with a code.</p>
        )}
      </section>
      <InstallApp />

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <CreateCalendarForm defaultName={session.user.name} />
        <JoinCalendarForm defaultName={session.user.name} />
      </section>
    </main>
  );
}
