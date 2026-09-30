import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCalendarSession } from "@/lib/security/session";
import { isSameOriginMutation } from "@/lib/security/request";
import { matchesExpectedCalendar } from "@/lib/calendar-sharing/policy";
import { salonActionSchema, salonDateSchema } from "@/lib/salon/contracts";
import {
  loadSalon,
  loadSalonSlots,
  loadSalonAppointmentSlots,
  mutateSalon,
  salonErrorResponse,
} from "@/lib/salon/service";
const headers = { "Cache-Control": "private, no-store" };
const result = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers });
function fail(error: unknown) {
  const failure = salonErrorResponse(error);
  return result({ error: failure.error }, failure.status);
}
export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) return result({ error: "Sign in to open the salon." }, 401);
  if (
    !matchesExpectedCalendar(
      request.headers.get("x-covie-calendar-id"),
      session.calendarId,
    )
  )
    return result(
      { error: "Your selected calendar changed. Reload this page." },
      409,
    );
  try {
    const params = request.nextUrl.searchParams;
    const date = params.get("date") || undefined;
    if (date) salonDateSchema.parse(date);
    if (params.has("appointmentId"))
      return result({
        calendarId: session.calendarId,
        date,
        slots: await loadSalonAppointmentSlots(
          session,
          z.string().uuid().parse(params.get("appointmentId")),
          salonDateSchema.parse(date),
        ),
      });
    if (params.has("serviceId"))
      return result({
        calendarId: session.calendarId,
        date,
        slots: await loadSalonSlots(
          session,
          salonDateSchema.parse(date),
          z.string().uuid().parse(params.get("serviceId")),
          params.get("practitionerId")
            ? z.string().uuid().parse(params.get("practitionerId"))
            : undefined,
        ),
      });
    return result(await loadSalon(session, date));
  } catch (error) {
    return fail(error);
  }
}
const command = z
  .object({ action: salonActionSchema, data: z.unknown() })
  .strict();
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request))
    return result({ error: "This request was blocked for safety." }, 403);
  const session = await getCalendarSession();
  if (!session) return result({ error: "Sign in to open the salon." }, 401);
  if (
    !matchesExpectedCalendar(
      request.headers.get("x-covie-calendar-id"),
      session.calendarId,
    )
  )
    return result(
      { error: "Your selected calendar changed. Reload before saving." },
      409,
    );
  try {
    const input = command.parse(await request.json());
    return result(await mutateSalon(session, input.action, input.data));
  } catch (error) {
    return fail(error);
  }
}
