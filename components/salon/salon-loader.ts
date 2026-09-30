export type SalonIdentity = {
  calendarId?: string;
  appointmentId?: string;
  date?: string;
};
export type SalonFetch = (url: string, init: RequestInit) => Promise<Response>;
export class SalonLoader<T> {
  private sequence = 0;
  private controller: AbortController | null = null;
  constructor(
    private readonly request: SalonFetch = (url, init) => fetch(url, init),
  ) {}
  cancel() {
    this.sequence += 1;
    this.controller?.abort();
    this.controller = null;
  }
  async load(
    url: string,
    identity: SalonIdentity,
    calendarHeader?: string,
  ): Promise<T | null> {
    this.cancel();
    const sequence = this.sequence,
      controller = new AbortController();
    this.controller = controller;
    try {
      const response = await this.request(url, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        headers: calendarHeader
          ? { "x-covie-calendar-id": calendarHeader }
          : undefined,
      });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted || sequence !== this.sequence) return null;
      if (!response.ok)
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "This information could not be loaded. Try again.",
        );
      if (
        !body ||
        typeof body !== "object" ||
        (identity.calendarId && body.calendarId !== identity.calendarId) ||
        (identity.appointmentId &&
          body.appointment?.id !== identity.appointmentId) ||
        (identity.date && body.date !== identity.date)
      )
        throw new Error(
          "The selected calendar, appointment or day changed. Reload before continuing.",
        );
      return body as T;
    } catch (error) {
      if (controller.signal.aborted || sequence !== this.sequence) return null;
      throw error instanceof TypeError
        ? new Error("The connection was interrupted. Try refreshing.")
        : error;
    }
  }
}
