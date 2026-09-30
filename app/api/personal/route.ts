import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { loadPersonalData, PersonalAccessError } from "@/lib/personal/service";

export async function GET(request: Request) {
  const { data: session } = await auth.getSession();
  const headers = { "Cache-Control": "private, no-store" };
  if (!session?.user) return NextResponse.json({ error: "Sign in to see your Personal calendar." }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  try {
    const data = await loadPersonalData(session.user.id, { month: params.get("month") || undefined, timezone: params.get("timezone") || undefined, source: params.get("source") || undefined });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof PersonalAccessError) return NextResponse.json({ error: error.message }, { status: 403, headers });
    if (error instanceof Error && /^Choose a valid/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers });
    return NextResponse.json({ error: "Your overview could not be loaded. Try again." }, { status: 500, headers });
  }
}
