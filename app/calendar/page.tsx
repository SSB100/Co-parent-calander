import { cookies } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { NewCalendarWelcome } from "@/components/onboarding/new-calendar-welcome";
import { calendarRangeForDate, loadCalendarData } from "@/lib/calendar/load-calendar";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { getSql } from "@/lib/db";
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
  const initialToday = localDateInTimeZone(session.calendarTimezone);
  const initialRange = calendarRangeForDate(initialToday);
  const sql = getSql();

  const calendarRowsPromise = sql`
    SELECT
      calendar.id,
      calendar.name,
      membership.permission,
      participant.display_name
    FROM calendar_memberships membership
    JOIN calendars calendar ON calendar.id = membership.calendar_id
    LEFT JOIN participants participant ON participant.id = membership.participant_id
    WHERE membership.user_id = ${session.userId}
    ORDER BY membership.created_at ASC
  `;

  const [calendarRows, initialData, cookieStore] = await Promise.all([
    calendarRowsPromise,
    loadCalendarData(session, initialRange),
    cookies(),
  ]);

  const calendars = calendarRows as Array<{
    id: string;
    name: string;
    permission: "owner" | "editor" | "viewer";
    display_name: string | null;
  }>;
  const calendarOptions = calendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    permission: calendar.permission,
    displayName: calendar.display_name,
  }));

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
