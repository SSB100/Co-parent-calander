"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SELECTED_CALENDAR_COOKIE_NAME } from "@/lib/security/session";
import { redeemTimesheetsInvitation, timesheetsErrorResponse } from "@/lib/timesheets/service";
export async function acceptTimesheetsInvitation(_previous: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const { data: session } = await auth.getSession();
  if (!session?.user) return { error: "Sign in with your invited email address first." };
  let calendarId: string;
  try { calendarId = await redeemTimesheetsInvitation(String(form.get("token") ?? ""), session.user.id); }
  catch (error) { return { error: timesheetsErrorResponse(error).error }; }
  (await cookies()).set(SELECTED_CALENDAR_COOKIE_NAME, calendarId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/calendar-types/timesheets");
}
