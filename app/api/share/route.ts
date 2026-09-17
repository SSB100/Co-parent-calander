import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

const retiredResponse = () =>
  NextResponse.json(
    { error: "Public sharing links have been replaced by account invitation codes." },
    { status: 410 },
  );

export async function GET() {
  await getEditorSession();
  return retiredResponse();
}

async function retireMutation(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  await getEditorSession();
  return retiredResponse();
}

export async function POST(request: NextRequest) {
  return retireMutation(request);
}

export async function DELETE(request: NextRequest) {
  return retireMutation(request);
}
