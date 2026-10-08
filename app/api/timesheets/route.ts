import { NextResponse, type NextRequest } from "next/server";
import { getCalendarSession } from "@/lib/security/session";
import { isSameOriginMutation } from "@/lib/security/request";
import { matchesExpectedCalendar } from "@/lib/calendar-sharing/policy";
import { timesheetsViewSchema } from "@/lib/timesheets/contracts";
import { exportTimesheetsCsv, loadTimesheets, loadTimesheetsHistory, mutateTimesheets, timesheetsErrorResponse } from "@/lib/timesheets/service";
const headers = { "Cache-Control": "private, no-store" };
const result = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
function fail(error: unknown) { const failure = timesheetsErrorResponse(error); return result({ error: failure.error }, failure.status); }
export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) return result({ error: "Sign in to open Timesheets." }, 401);
  if (!matchesExpectedCalendar(request.headers.get("x-covie-calendar-id"), session.calendarId)) return result({ error: "Your selected calendar changed. Reload this page." }, 409);
  try {
    const params = request.nextUrl.searchParams;
    if (params.has("entryId")) return result({ calendarId: session.calendarId, history: await loadTimesheetsHistory(session, params.get("entryId")!) });
    const data = await loadTimesheets(session, params.get("date") || undefined, timesheetsViewSchema.parse(params.get("view") || "week"));
    if (params.get("format") === "csv") return new NextResponse(exportTimesheetsCsv(data), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="timesheets-${data.date}.csv"`, "X-Content-Type-Options": "nosniff" } });
    return result(data);
  } catch (error) { return fail(error); }
}
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return result({ error: "This request was blocked for safety." }, 403);
  const session = await getCalendarSession();
  if (!session) return result({ error: "Sign in to open Timesheets." }, 401);
  if (!matchesExpectedCalendar(request.headers.get("x-covie-calendar-id"), session.calendarId)) return result({ error: "Your selected calendar changed. Reload before saving." }, 409);
  try { return result(await mutateTimesheets(session, await request.json())); }
  catch (error) { return fail(error); }
}
