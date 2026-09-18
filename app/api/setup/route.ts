import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      error:
        "Legacy setup links have been retired. Create or join a calendar from your Covie dashboard.",
    },
    { status: 410 },
  );
}
