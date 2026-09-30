export class CalendarContextChangedError extends Error {
  constructor() {
    super("Your selected calendar changed. Reload this page before continuing.");
    this.name = "CalendarContextChangedError";
  }
}

export class CalendarAccessDeniedError extends Error {
  constructor(message: string) { super(message); this.name = "CalendarAccessDeniedError"; }
}

export function throwIfCalendarAccessDenied(status: number, body: unknown) {
  if (status !== 401 && status !== 403) return;
  const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Your calendar access has changed. Reload or contact the organiser.";
  throw new CalendarAccessDeniedError(message);
}

/** Bind requests to the calendar rendered by the route, never a later response. */
export function calendarContextHeaders(calendarId: string) {
  if (!calendarId) throw new Error("Reload this page before continuing.");
  return { "x-covie-calendar-id": calendarId };
}

export function throwIfCalendarContextChanged(status: number, body: unknown) {
  if (status !== 409 || !body || typeof body !== "object") return;
  const error = body as { code?: unknown; error?: unknown };
  if (error.code === "calendar_changed" || (typeof error.error === "string" && error.error.startsWith("Your selected calendar changed."))) {
    throw new CalendarContextChangedError();
  }
}

export function requireCalendarContext<T extends { calendarId: string }>(data: T, expectedCalendarId: string): T {
  if (data.calendarId !== expectedCalendarId) throw new CalendarContextChangedError();
  return data;
}
