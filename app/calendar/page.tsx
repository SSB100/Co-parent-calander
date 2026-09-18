import { cookies } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { NewCalendarWelcome } from "@/components/onboarding/new-calendar-welcome";
import {
  NEW_CALENDAR_INVITE_COOKIE_NAME,
  normalizeInviteCode,
} from "@/lib/security/invites";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");

  const params = await searchParams;
  const cookieStore = await cookies();
  const inviteCode =
    params.welcome === "created"
      ? normalizeInviteCode(cookieStore.get(NEW_CALENDAR_INVITE_COOKIE_NAME)?.value ?? "")
      : "";

  return (
    <>
      {inviteCode ? <NewCalendarWelcome inviteCode={inviteCode} /> : null}
      <CalendarShell />
    </>
  );
}
