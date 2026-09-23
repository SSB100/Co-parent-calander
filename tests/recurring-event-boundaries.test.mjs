import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file) => readFile(path.join(root, file), "utf8");

test("recurring shared events have an explicit schema and migration", async () => {
  const [schema, migration] = await Promise.all([
    source("lib/db/schema/events.ts"),
    source("drizzle/0006_recurring_events.sql"),
  ]);

  assert.match(schema, /eventRecurrence/);
  assert.match(schema, /recurrenceEndDate/);
  assert.match(migration, /CREATE TYPE "event_recurrence"/);
  for (const value of ["none", "weekly", "fortnightly", "monthly", "yearly"]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  assert.match(migration, /events_calendar_recurrence_idx/);
});

test("event service saves whole-series recurrence immediately with audit and full sync", async () => {
  const [model, service] = await Promise.all([
    source("lib/events/model.ts"),
    source("lib/events/service.ts"),
  ]);

  assert.match(model, /default\("none"\)/);
  assert.match(model, /recurrenceEndDate/);
  assert.match(model, /The repeat-until date cannot be before the first event/);
  assert.doesNotMatch(service, /createApprovalProposal/);
  assert.match(service, /INSERT INTO events \(/);
  assert.match(service, /recurrence, recurrence_end_date/);
  assert.match(service, /SET[\s\S]*recurrence = \$\{details\.recurrence\}/);
  assert.match(service, /event\.create/);
  assert.match(service, /event\.update/);
  assert.match(service, /event\.delete/);
  assert.match(service, /pending: false as const/);
  assert.match(service, /jobType: "full"/);
  assert.match(service, /expandEventOccurrences/);
});

test("calendar and Google expand only stored event series", async () => {
  const [calendar, sync, mapping] = await Promise.all([
    source("lib/calendar/load-calendar.ts"),
    source("lib/google-calendar/sync.ts"),
    source("lib/google-calendar/mapping.ts"),
  ]);

  assert.match(calendar, /expandEventOccurrences/);
  assert.match(calendar, /events: visibleEvents/);
  assert.match(sync, /expandEventOccurrences/);
  assert.match(sync, /recurrenceEndDate/);
  assert.match(mapping, /event\.seriesId && event\.occurrenceKey/);
  assert.doesNotMatch(mapping, /approvalProposals|proposedState|pendingProposals/);
});

test("event editor keeps recurrence progressive and mobile friendly", async () => {
  const panel = await source("components/calendar/event-panel.tsx");

  assert.match(panel, />Repeat</);
  assert.match(panel, /Does not repeat/);
  assert.match(panel, /Fortnightly/);
  assert.match(panel, /Repeat until/);
  assert.match(panel, /form\.recurrence !== "none"/);
  assert.doesNotMatch(panel, /this occurrence|following occurrences/i);
});
