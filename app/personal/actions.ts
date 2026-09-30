"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { SELECTED_CALENDAR_COOKIE_NAME } from "@/lib/security/session";
import { isCalendarTemplateId } from "@/lib/templates/calendar-templates";
import { sourceDestination } from "@/lib/personal/source-navigation";

export async function openPersonalSource(form: FormData) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const input = z.object({ calendarId: z.string().uuid(), target: z.enum(["calendar", "tasks", "expenses", "approvals"]), sourceId: z.string().max(100), date: z.string().max(10).optional() }).safeParse(Object.fromEntries(form));
  if (!input.success) redirect("/personal?notice=unavailable");
  const sql = getSql();
  const rows = await sql`SELECT c.calendar_type AS type FROM calendars c JOIN calendar_memberships m ON m.calendar_id=c.id WHERE c.id=${input.data.calendarId} AND m.user_id=${session.user.id} AND c.archived_at IS NULL`;
  const type = rows[0]?.type;
  if (!isCalendarTemplateId(type)) redirect("/personal?notice=unavailable");
  const destination = sourceDestination(type, input.data.target, input.data.sourceId, input.data.date || "");
  if (!destination) redirect("/personal?notice=unavailable");
  const jar = await cookies();
  jar.set(SELECTED_CALENDAR_COOKIE_NAME, input.data.calendarId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(destination);
}
