import { NextResponse } from "next/server";
import { HomeNotFoundError, loadHomeData } from "@/lib/home/load-home";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(await loadHomeData(session));
  } catch (error) {
    if (error instanceof HomeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
