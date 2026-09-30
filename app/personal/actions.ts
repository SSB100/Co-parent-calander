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
  if (!session?.user) redirect("/auth/sign-in?returnTo=%2Fpersonal");
  const input = z
    .object({
      calendarId: z.string().uuid(),
      target: z.enum([
        "calendar",
        "tasks",
        "expenses",
        "approvals",
        "appointment",
      ]),
      sourceId: z.string().max(100),
      date: z.string().max(10).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success) redirect("/personal?notice=unavailable");
  const sql = getSql();
  if (input.data.target === "appointment") {
    const appointmentId = z.string().uuid().safeParse(input.data.sourceId);
    if (!appointmentId.success) redirect("/personal?notice=unavailable");
    const found =
      await sql`SELECT a.client_user_id=${session.user.id} AS own_client
      FROM salon_appointments a JOIN calendars c ON c.id=a.calendar_id
      JOIN salon_practitioners p ON p.id=a.practitioner_id AND p.calendar_id=c.id
      LEFT JOIN calendar_memberships m ON m.calendar_id=c.id AND m.user_id=${session.user.id}
      WHERE a.id=${appointmentId.data} AND a.calendar_id=${input.data.calendarId}
      AND c.calendar_type='salon_bookings' AND c.archived_at IS NULL
      AND (a.client_user_id=${session.user.id} OR (p.user_id=${session.user.id} AND p.active AND m.permission IN ('owner','editor')))`;
    if (!found.length) redirect("/personal?notice=unavailable");
    if (found[0].own_client) redirect(`/booking/manage/${appointmentId.data}`);
    const jar = await cookies();
    jar.set(SELECTED_CALENDAR_COOKIE_NAME, input.data.calendarId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    redirect(
      sourceDestination(
        "salon_bookings",
        "calendar",
        appointmentId.data,
        input.data.date || "",
      )!,
    );
  }
  const rows =
    await sql`SELECT c.calendar_type AS type FROM calendars c JOIN calendar_memberships m ON m.calendar_id=c.id WHERE c.id=${input.data.calendarId} AND m.user_id=${session.user.id} AND c.archived_at IS NULL`;
  const type = rows[0]?.type;
  if (!isCalendarTemplateId(type)) redirect("/personal?notice=unavailable");
  const destination = sourceDestination(
    type,
    input.data.target,
    input.data.sourceId,
    input.data.date || "",
  );
  if (!destination) redirect("/personal?notice=unavailable");
  const jar = await cookies();
  jar.set(SELECTED_CALENDAR_COOKIE_NAME, input.data.calendarId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(destination);
}
