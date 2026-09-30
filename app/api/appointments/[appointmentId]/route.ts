import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { isSameOriginMutation } from "@/lib/security/request";
import {
  loadOwnAppointment,
  changeOwnAppointment,
  salonErrorResponse,
} from "@/lib/salon/service";
const headers = { "Cache-Control": "private, no-store" };
const result = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers });
function fail(error: unknown) {
  const failure = salonErrorResponse(error);
  return result({ error: failure.error }, failure.status);
}
type Context = { params: Promise<{ appointmentId: string }> };
export async function GET(request: NextRequest, context: Context) {
  const { data: session } = await auth.getSession();
  if (!session?.user)
    return result({ error: "Sign in to view your appointment." }, 401);
  try {
    return result(
      await loadOwnAppointment(
        session.user.id,
        z
          .string()
          .uuid()
          .parse((await context.params).appointmentId),
        request.nextUrl.searchParams.get("date") || undefined,
      ),
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request))
    return result({ error: "This request was blocked for safety." }, 403);
  const { data: session } = await auth.getSession();
  if (!session?.user)
    return result({ error: "Sign in to manage your appointment." }, 401);
  try {
    const id = z
      .string()
      .uuid()
      .parse((await context.params).appointmentId);
    const input = z
      .object({
        action: z.enum(["cancel", "reschedule"]),
        data: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(await request.json());
    if (input.data.id !== id)
      return result(
        { error: "The selected appointment changed. Reload before saving." },
        409,
      );
    return result(
      await changeOwnAppointment(
        { id: session.user.id },
        input.action,
        input.data,
      ),
    );
  } catch (error) {
    return fail(error);
  }
}
