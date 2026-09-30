import type { PersonalData } from "@/lib/personal/contracts";
import { personalQueryKey, scopePersonalData, type PersonalQuery } from "./personal-ui";

type PersonalFetch = (input: string, init: RequestInit) => Promise<Response>;

function isPersonalData(value: unknown): value is PersonalData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<PersonalData>;
  return typeof data.month === "string" && typeof data.timezone === "string" && typeof data.today === "string" && Array.isArray(data.sources) && Array.isArray(data.items) && Array.isArray(data.attention) && Array.isArray(data.warnings);
}

/** One in-memory request at a time. Aborted responses cannot restore private data. */
export class PersonalLoader {
  private sequence = 0;
  private controller: AbortController | null = null;

  constructor(private readonly request: PersonalFetch = (input, init) => fetch(input, init)) {}

  cancel() {
    this.sequence += 1;
    this.controller?.abort();
    this.controller = null;
  }

  async load(query: PersonalQuery): Promise<PersonalData | null> {
    this.cancel();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await this.request(`/api/personal?${personalQueryKey(query)}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted || sequence !== this.sequence) return null;
      if (!response.ok) {
        if (response.status === 401) throw new Error("Your session has ended. Sign in again to view Personal.");
        if (response.status === 403 || response.status === 404) throw new Error("This calendar is no longer available. Choose all calendars to refresh your access.");
        throw new Error("Personal could not be refreshed. Try again when your connection is ready.");
      }
      if (!isPersonalData(body) || body.month !== query.month || body.timezone !== query.timezone) throw new Error("Personal could not be verified. Refresh to try again.");
      if (query.source && !body.sources.some((source) => source.id === query.source)) throw new Error("This calendar is no longer available. Choose all calendars to refresh your access.");
      return scopePersonalData(body, query.source);
    } catch (error) {
      if (controller.signal.aborted || sequence !== this.sequence) return null;
      throw error instanceof Error ? error : new Error("Personal could not be refreshed. Try again.");
    }
  }
}
