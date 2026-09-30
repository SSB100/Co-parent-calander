import { getSql } from "@/lib/db";
import { localDateInTimeZone } from "@/lib/calendar/time";
import type { PersonalData, PersonalItem, PersonalSource } from "./contracts";
import { canonicalPersonalItems, itemInPersonalMonth, normalisePersonalItem, personalCareItems, personalTimezone, personalWindow, type CareProjection } from "./model";
import { personalQueries, personalSourcesSql } from "./queries";

type InternalSource = PersonalSource & { accessKey?: string };
const publicSources = (rows: InternalSource[]): PersonalSource[] => rows.map(({ id, name, type, timezone }) => ({ id, name, type, timezone }));

export class PersonalAccessError extends Error {}
export type PersonalQuery = (statement: string, parameters: (string | null)[]) => Promise<unknown[]>;
export type PersonalOptions = { month?: string; timezone?: string; source?: string };

/** Read-only and uncached: membership is checked by every adapter and again before return. */
export async function loadPersonalData(userId: string, options: PersonalOptions = {}, query: PersonalQuery = (statement, parameters) => getSql().query(statement, parameters), now = new Date()): Promise<PersonalData> {
  const sources = await query(personalSourcesSql, [userId]) as InternalSource[];
  const timezone = personalTimezone(options.timezone || sources[0]?.timezone || "UTC");
  const month = options.month || localDateInTimeZone(timezone, now).slice(0, 7);
  const { first, next } = personalWindow(month);
  if (options.source && !sources.some((source) => source.id === options.source)) throw new PersonalAccessError("This calendar is no longer available to your account. Reload your overview.");
  if (!sources.length) return { month, timezone, today: localDateInTimeZone(timezone, now), sources, items: [], attention: [], warnings: [] };
  const parameters = [userId, first, next, options.source || null];
  const results = await Promise.all(Object.entries(personalQueries).map(async ([name, statement]) => ({ name, rows: await query(statement, parameters) })));
  const warnings: string[] = [];
  const projected: PersonalItem[] = [];
  for (const { name, rows } of results) {
    if (name === "care") {
      const careItems = (rows as CareProjection[]).flatMap((row) => personalCareItems(row, month));
      if (careItems.length > 1000) warnings.push("Care context is limited to 1,000 items. Choose one source or open its calendar for the full schedule.");
      projected.push(...careItems.slice(0, 1000));
    } else {
      if (rows.length > 1000) warnings.push("Some source items are outside this view’s limit. Choose a single source calendar or open it directly for the complete list.");
      projected.push(...(rows.slice(0, 1000) as Omit<PersonalItem, "id">[]).map(normalisePersonalItem));
    }
  }
  const currentSources = await query(personalSourcesSql, [userId]) as InternalSource[];
  if (options.source && !currentSources.some((source) => source.id === options.source)) throw new PersonalAccessError("Access to this calendar changed. Reload your overview.");
  const initialAccess = new Map(sources.map((source) => [source.id, source.accessKey]));
  const allowed = new Set(currentSources.filter((source) => initialAccess.has(source.id) && initialAccess.get(source.id) === source.accessKey).map((source) => source.id));
  if (currentSources.some((source) => !allowed.has(source.id))) warnings.push("Some calendar access changed while loading. Refresh to see the latest items.");
  const items = canonicalPersonalItems(projected.filter((item) => allowed.has(item.calendarId)));
  return { month, timezone, today: localDateInTimeZone(timezone, now), sources: publicSources(currentSources), items: items.filter((item) => item.state !== "attention" && itemInPersonalMonth(item, month, timezone)), attention: items.filter((item) => item.state === "attention"), warnings: [...new Set(warnings)] };
}
