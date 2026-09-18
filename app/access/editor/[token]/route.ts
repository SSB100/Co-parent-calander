import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const destination = new URL("/auth/sign-in", request.url);
  destination.searchParams.set("legacy", "retired");
  return NextResponse.redirect(destination);
}
