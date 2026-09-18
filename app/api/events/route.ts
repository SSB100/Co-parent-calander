import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createEventSchema,
  deleteEventSchema,
  editEventSchema,
  eventDateSchema,
} from "@/lib/events/model";
import {
  createEvent,
  deleteEvent,
  EventServiceError,
  listEvents,
  updateEvent,
} from "@/lib/events/service";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

function eventServiceError(error: unknown) {
  if (error instanceof EventServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: "The event request could not be completed." },
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

  const requestedDate = request.nextUrl.searchParams.get("date");
  const parsedDate = requestedDate ? eventDateSchema.safeParse(requestedDate) : null;
  if (requestedDate && !parsedDate?.success) {
    return NextResponse.json(
      { error: "Choose a valid event date." },
      { status: 400 },
    );
  }

  const targetDate = parsedDate?.success ? parsedDate.data : null;
  return NextResponse.json({
    events: await listEvents({
      calendarId: session.calendarId,
      calendarTimezone: session.calendarTimezone,
      targetDate,
    }),
  });
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

  const parsed = createEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid event details." },
      { status: 400 },
    );
  }

  const { reason, ...details } = parsed.data;
  try {
    const result = await createEvent({ session, details, reason });
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    return eventServiceError(error);
  }
}

export async function PATCH(request: NextRequest) {
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

  const parsed = editEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid event details." },
      { status: 400 },
    );
  }

  const { id, reason, ...details } = parsed.data;
  try {
    const result = await updateEvent({ session, id, details, reason });
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    return eventServiceError(error);
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

  const parsed = deleteEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid event." },
      { status: 400 },
    );
  }

  try {
    const result = await deleteEvent({
      session,
      id: parsed.data.id,
      reason: parsed.data.reason,
    });
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    return eventServiceError(error);
  }
}
