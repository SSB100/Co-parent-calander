import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { isSameOriginMutation } from "@/lib/security/request";
import {
  bookPublicSalon,
  loadPublicSalon,
  salonErrorResponse,
} from "@/lib/salon/service";
const headers = { "Cache-Control": "private, no-store" };
const result = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers });
function fail(error: unknown) {
  const failure = salonErrorResponse(error);
  return result({ error: failure.error }, failure.status);
}
type Context = { params: Promise<{ calendarId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const id = z
        .string()
        .uuid()
        .parse((await context.params).calendarId),
      query = request.nextUrl.searchParams;
    return result(
      await loadPublicSalon(
        id,
        query.get("date") || undefined,
        query.get("serviceId") || undefined,
        query.get("practitionerId") || undefined,
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
    return result({ error: "Sign in to book this appointment." }, 401);
  try {
    return result(
      await bookPublicSalon(
        { id: session.user.id },
        z
          .string()
          .uuid()
          .parse((await context.params).calendarId),
        await request.json(),
      ),
    );
  } catch (error) {
    return fail(error);
  }
}
