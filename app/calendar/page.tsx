import { cookies } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { NewCalendarWelcome } from "@/components/onboarding/new-calendar-welcome";
import { calendarRangeForDate, loadCalendarData } from "@/lib/calendar/load-calendar";
import { localDateInTimeZone } from "@/lib/calendar/time";
import {
  NEW_CALENDAR_INVITE_COOKIE_NAME,
  normalizeInviteCode,
} from "@/lib/security/invites";
import { getCalendarSession } from "@/lib/security/session";
import {
  listArchivedCalendarNavigationOptions,
  listCalendarNavigationOptions,
} from "@/lib/calendars/navigation";
import { calendarPathForType } from "@/lib/templates/calendar-templates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");
  if (session.calendarType !== "co_parenting") {
    redirect(calendarPathForType(session.calendarType));
  }

  const params = await searchParams;
  const initialToday = localDateInTimeZone(session.calendarTimezone);
  const initialRange = calendarRangeForDate(initialToday);
  const [calendarOptions, archivedCalendarOptions, initialData, cookieStore] =
    await Promise.all([
      listCalendarNavigationOptions(session.userId),
      listArchivedCalendarNavigationOptions(session.userId),
      loadCalendarData(session, initialRange),
      cookies(),
    ]);

  const inviteCode =
    params.welcome === "created"
      ? normalizeInviteCode(
          cookieStore.get(NEW_CALENDAR_INVITE_COOKIE_NAME)?.value ?? "",
        )
      : "";

  return (
    <>
      {inviteCode ? <NewCalendarWelcome inviteCode={inviteCode} /> : null}
      <CalendarShell
        key={session.calendarId}
        calendars={calendarOptions}
        archivedCalendars={archivedCalendarOptions}
        currentCalendarId={session.calendarId}
        defaultName={session.userName}
        initialMonth={initialRange.month}
        initialRange={{ from: initialRange.from, to: initialRange.to }}
        initialToday={initialToday}
        initialData={initialData}
      />
    </>
  );
}
