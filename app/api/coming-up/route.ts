import { NextResponse } from "next/server";
import { getCalendarSession } from "@/lib/security/session";
import { listExpenses } from "@/lib/expenses/service";
import { listResponsibilities } from "@/lib/responsibilities/service";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { comingUp } from "@/lib/workspace/coming-up";
export async function GET() {
  const session = await getCalendarSession();
  if (!session) return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  try {
    const [expenses, responsibilities] = await Promise.all([listExpenses({ session, date: null }), listResponsibilities({ session, date: null })]);
    return NextResponse.json(comingUp(expenses.expenses, responsibilities.responsibilities, localDateInTimeZone(session.calendarTimezone)), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Coming up is unavailable." }, { status: 500 }); }
}
