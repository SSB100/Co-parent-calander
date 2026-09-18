import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createEntityLinkSchema,
  linkedEntitySchema,
} from "@/lib/links/model";
import {
  createRelatedItemLink,
  deleteRelatedItemLink,
  listRelatedItems,
  RelatedItemsServiceError,
} from "@/lib/links/service";
import { isSameOriginMutation } from "@/lib/security/request";
import {
  getCalendarSession,
  getEditorSession,
} from "@/lib/security/session";

function relatedItemsServiceError(error: unknown) {
  if (error instanceof RelatedItemsServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  return NextResponse.json(
    { error: "The related-items request could not be completed." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const parsed = linkedEntitySchema.safeParse({
    entityType: request.nextUrl.searchParams.get("entityType"),
    entityId: request.nextUrl.searchParams.get("entityId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid related item." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await listRelatedItems({
        session,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        includeCandidates:
          request.nextUrl.searchParams.get("includeCandidates") === "true",
      }),
    );
  } catch (error) {
    return relatedItemsServiceError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = createEntityLinkSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose two valid Covie items to link." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createRelatedItemLink({
        session,
        link: parsed.data,
      }),
    );
  } catch (error) {
    return relatedItemsServiceError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = createEntityLinkSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid related item." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await deleteRelatedItemLink({
        session,
        link: parsed.data,
      }),
    );
  } catch (error) {
    return relatedItemsServiceError(error);
  }
}
