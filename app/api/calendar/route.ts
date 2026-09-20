import { NextResponse } from "next/server";
import {
  CalendarNotFoundError,
  calendarRangeSchema,
  loadCalendarData,
} from "@/lib/calendar/load-calendar";
import { getCalendarSession } from "@/lib/security/session";

export async function GET(request: Request) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsed = calendarRangeSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Choose a valid calendar range.",
      },
      { status: 400 },
    );
  }

  try {
    const data = await loadCalendarData(session, parsed.data);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CalendarNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
