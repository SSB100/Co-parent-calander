import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isSameOriginMutation } from "@/lib/security/request";
import { SELECTED_CALENDAR_COOKIE_NAME } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  await auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SELECTED_CALENDAR_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
