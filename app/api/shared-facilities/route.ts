import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCalendarSession } from "@/lib/security/session";
import { matchesExpectedCalendar } from "@/lib/calendar-sharing/policy";
import { isSameOriginMutation } from "@/lib/security/request";
import { facilityBookingSchema, facilityDecisionSchema, facilityResourceSchema, facilityRulesSchema } from "@/lib/shared-facilities/contracts";
import { decideFacilityBooking, FacilityError, loadFacilities, saveFacilityBooking, saveFacilityResource, saveFacilityRules } from "@/lib/shared-facilities/service";

function apiError(error: unknown) {
  if (error instanceof FacilityError) return NextResponse.json({ error: error.message }, { status: error.status });
  const db = error as { constraint?: string; message?: string; cause?: { constraint?: string; message?: string } };
  const constraint = db.constraint ?? db.cause?.constraint ?? "";
  if (constraint.startsWith("facility_booking_")) return NextResponse.json({ error: db.cause?.message ?? db.message ?? "This booking could not be saved. Reload and check the booking rules." }, { status: 409 });
  if (constraint === "facility_bookings_calendar_id_user_id_request_key_key") return NextResponse.json({ error: "This booking was already submitted. Reload to see it." }, { status: 409 });
  if (constraint === "facility_resource_name_unique") return NextResponse.json({ error: "An active resource already has that name. Choose another name." }, { status: 409 });
  return NextResponse.json({ error: "The facilities request could not be completed. Please try again." }, { status: 500 });
}
export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  if (!matchesExpectedCalendar(request.headers.get("x-covie-calendar-id"), session.calendarId)) return NextResponse.json({ error: "Your selected calendar changed. Reload this page." }, { status: 409 });
  try { return NextResponse.json(await loadFacilities(session, request.nextUrl.searchParams.get("date") ?? undefined)); } catch (error) { return apiError(error); }
}
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resource"), data: facilityResourceSchema }),
  z.object({ action: z.literal("rules"), data: facilityRulesSchema }),
  z.object({ action: z.literal("booking"), data: facilityBookingSchema }),
  z.object({ action: z.literal("decision"), data: facilityDecisionSchema }),
]);
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  const session = await getCalendarSession();
  if (!session) return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  if (!matchesExpectedCalendar(request.headers.get("x-covie-calendar-id"), session.calendarId)) return NextResponse.json({ error: "Your selected calendar changed. Reload this page before saving." }, { status: 409 });
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details." }, { status: 400 });
  try {
    const command = parsed.data;
    if (command.action === "resource") return NextResponse.json(await saveFacilityResource(session, command.data));
    if (command.action === "rules") return NextResponse.json(await saveFacilityRules(session, command.data));
    if (command.action === "booking") return NextResponse.json(await saveFacilityBooking(session, command.data));
    return NextResponse.json(await decideFacilityBooking(session, command.data));
  } catch (error) { return apiError(error); }
}
