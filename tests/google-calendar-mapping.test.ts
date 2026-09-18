import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHandoverGoogleEvents,
  buildParentingGoogleEvents,
  buildSharedGoogleEvents,
  googleAllDayExclusiveEnd,
  googleEventIdForLocalKey,
  type MappingAssignment,
  type MappingSettings,
} from "../lib/google-calendar/mapping";
import { decryptGoogleSecret, encryptGoogleSecret } from "../lib/google-calendar/crypto";
import { deleteManagedEvent, upsertManagedEvent } from "../lib/google-calendar/google-api";
import { nextGoogleSyncRetryDelayMs } from "../lib/google-calendar/queue";

const parentA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const parentB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const childA = "11111111-1111-4111-8111-111111111111";
const childB = "22222222-2222-4222-8222-222222222222";

const parents = [
  { id: parentA, displayName: "Alex" },
  { id: parentB, displayName: "Jordan" },
];
const children = [
  { id: childA, displayName: "Sam" },
  { id: childB, displayName: "Riley" },
];
const settings: MappingSettings = {
  syncParenting: true,
  syncHandovers: true,
  syncSharedEvents: true,
  syncLocations: true,
  syncSharedNotes: false,
  parentLabelMode: "names",
};

function assignment(
  childId: string,
  date: string,
  morningParentId = parentA,
  afternoonParentId = morningParentId,
  overrides: Partial<MappingAssignment> = {},
): MappingAssignment {
  return {
    childId,
    date,
    morningParentId,
    afternoonParentId,
    handoverTime: null,
    handoverLocation: null,
    note: null,
    ...overrides,
  };
}

test("consecutive identical parenting days merge into one all-day block", () => {
  const assignments = ["2026-09-18", "2026-09-19", "2026-09-20"].flatMap((date) => [
    assignment(childA, date),
    assignment(childB, date),
  ]);
  const result = buildParentingGoogleEvents({ parents, children, assignments, settings });

  assert.equal(result.length, 1);
  assert.equal(result[0].rangeStart, "2026-09-18");
  assert.equal(result[0].rangeEnd, "2026-09-20");
  assert.equal(result[0].body.start.date, "2026-09-18");
  assert.equal(result[0].body.end.date, "2026-09-21");
  assert.equal(result[0].body.summary, "Parenting — Alex");
});

test("a changed middle day splits a block and merging it back restores one block", () => {
  const base = ["2026-09-18", "2026-09-19", "2026-09-20"].map((date) =>
    assignment(childA, date),
  );
  const split = base.map((row) =>
    row.date === "2026-09-19" ? assignment(childA, row.date, parentB, parentB) : row,
  );

  const splitEvents = buildParentingGoogleEvents({
    parents,
    children: [children[0]],
    assignments: split,
    settings,
  });
  assert.deepEqual(
    splitEvents.map((event) => [event.rangeStart, event.rangeEnd, event.body.summary]),
    [
      ["2026-09-18", "2026-09-18", "Parenting — Alex"],
      ["2026-09-19", "2026-09-19", "Parenting — Jordan"],
      ["2026-09-20", "2026-09-20", "Parenting — Alex"],
    ],
  );

  const merged = buildParentingGoogleEvents({
    parents,
    children: [children[0]],
    assignments: base,
    settings,
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].rangeEnd, "2026-09-20");
});

test("matching children share one block while differing assignments name affected children", () => {
  const assignments = [
    assignment(childA, "2026-09-18"),
    assignment(childB, "2026-09-18"),
    assignment(childA, "2026-09-19", parentA, parentA),
    assignment(childB, "2026-09-19", parentB, parentB),
  ];
  const result = buildParentingGoogleEvents({ parents, children, assignments, settings });

  assert.equal(result[0].body.summary, "Parenting — Alex");
  const secondDay = result.filter((event) => event.rangeStart === "2026-09-19");
  assert.equal(secondDay.length, 2);
  assert.ok(secondDay.some((event) => event.body.summary.includes("Sam: Alex")));
  assert.ok(secondDay.some((event) => event.body.summary.includes("Riley: Jordan")));
});

test("split-day ownership supports neutral parent labels", () => {
  const result = buildParentingGoogleEvents({
    parents,
    children: [children[0]],
    assignments: [assignment(childA, "2026-09-18", parentA, parentB)],
    settings: { ...settings, parentLabelMode: "neutral" },
  });

  assert.equal(result[0].body.summary, "Parenting — Parent 1 → Parent 2");
});

test("Google all-day event end dates are exclusive", () => {
  assert.equal(googleAllDayExclusiveEnd("2026-09-18"), "2026-09-19");
  assert.equal(googleAllDayExclusiveEnd("2026-09-30"), "2026-10-01");
});

test("handover mapping uses calendar timezone and a 30 minute duration", () => {
  const rows = children.map((child) =>
    assignment(child.id, "2026-09-18", parentA, parentB, {
      handoverTime: "15:45:00",
      handoverLocation: "School gate",
      note: "Bring the sports bag",
    }),
  );

  const result = buildHandoverGoogleEvents({
    parents,
    children,
    assignments: rows,
    settings,
    timeZone: "Pacific/Auckland",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].body.start.dateTime, "2026-09-18T15:45:00");
  assert.equal(result[0].body.end.dateTime, "2026-09-18T16:15:00");
  assert.equal(result[0].body.start.timeZone, "Pacific/Auckland");
  assert.equal(result[0].body.location, "School gate");
  assert.doesNotMatch(result[0].body.description, /sports bag/i);

  const hiddenLocation = buildHandoverGoogleEvents({
    parents,
    children,
    assignments: rows,
    settings: { ...settings, syncLocations: false },
    timeZone: "Pacific/Auckland",
  });
  assert.equal(hiddenLocation[0].body.location, undefined);
});

test("disabled private handover fields cannot split otherwise identical child events", () => {
  const rows = [
    assignment(childA, "2026-09-18", parentA, parentB, {
      handoverTime: "15:45:00",
      handoverLocation: "Gate A",
      note: "Private note A",
    }),
    assignment(childB, "2026-09-18", parentA, parentB, {
      handoverTime: "15:45:00",
      handoverLocation: "Gate B",
      note: "Private note B",
    }),
  ];

  const privateResult = buildHandoverGoogleEvents({
    parents,
    children,
    assignments: rows,
    settings: { ...settings, syncLocations: false, syncSharedNotes: false },
    timeZone: "Pacific/Auckland",
  });
  assert.equal(privateResult.length, 1);
  assert.equal(privateResult[0].body.location, undefined);
  assert.doesNotMatch(privateResult[0].body.description, /Private note/);
  assert.equal(privateResult[0].body.summary, "Handover — Alex to Jordan");

  const sharedResult = buildHandoverGoogleEvents({
    parents,
    children,
    assignments: rows,
    settings: { ...settings, syncLocations: true, syncSharedNotes: true },
    timeZone: "Pacific/Auckland",
  });
  assert.equal(sharedResult.length, 2);
  assert.ok(sharedResult.some((event) => event.body.summary.includes("Sam:")));
  assert.ok(sharedResult.some((event) => event.body.summary.includes("Riley:")));
});

test("assignment notes affect parenting blocks only when note syncing is enabled", () => {
  const rows = [
    assignment(childA, "2026-09-18", parentA, parentA, { note: "Sam note" }),
    assignment(childB, "2026-09-18", parentA, parentA, { note: "Riley note" }),
  ];

  const hidden = buildParentingGoogleEvents({
    parents,
    children,
    assignments: rows,
    settings,
  });
  assert.equal(hidden.length, 1);
  assert.doesNotMatch(hidden[0].body.description, /Sam note|Riley note/);

  const visible = buildParentingGoogleEvents({
    parents,
    children,
    assignments: rows,
    settings: { ...settings, syncSharedNotes: true },
  });
  assert.equal(visible.length, 2);
  assert.ok(visible.some((event) => event.body.description.includes("Sam note")));
  assert.ok(visible.some((event) => event.body.description.includes("Riley note")));
});

test("shared events stay all-day and notes sync only when explicitly enabled", () => {
  const event = {
    id: "33333333-3333-4333-8333-333333333333",
    title: "School show",
    description: "Costume details",
    category: "school",
    startDate: "2026-10-01",
    endDate: "2026-10-02",
  };

  const hidden = buildSharedGoogleEvents({ events: [event], settings });
  assert.equal(hidden[0].body.start.date, "2026-10-01");
  assert.equal(hidden[0].body.end.date, "2026-10-03");
  assert.doesNotMatch(hidden[0].body.description, /Costume details/);

  const visible = buildSharedGoogleEvents({
    events: [event],
    settings: { ...settings, syncSharedNotes: true },
  });
  assert.match(visible[0].body.description, /Costume details/);
  assert.match(visible[0].body.description, /Managed by Covie/);
});

test("deterministic managed Google event IDs prevent retry duplicates", () => {
  const first = googleEventIdForLocalKey("connection-1", "event:local-1");

  assert.equal(first, googleEventIdForLocalKey("connection-1", "event:local-1"));
  assert.notEqual(first, googleEventIdForLocalKey("connection-2", "event:local-1"));
  assert.match(first, /^cpc[0-9a-f]+$/);
});

test("AES-256-GCM credential encryption round trips and rejects tampering", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptGoogleSecret("example-refresh-value", key);

  assert.notEqual(encrypted, "example-refresh-value");
  assert.equal(decryptGoogleSecret(encrypted, key), "example-refresh-value");

  const replacement = encrypted.endsWith("A") ? "B" : "A";
  const tampered = encrypted.slice(0, -1) + replacement;
  assert.throws(() => decryptGoogleSecret(tampered, key));
});

test("retry backoff is bounded", () => {
  assert.equal(nextGoogleSyncRetryDelayMs(1), 5 * 60 * 1000);
  assert.equal(nextGoogleSyncRetryDelayMs(2), 10 * 60 * 1000);
  assert.equal(nextGoogleSyncRetryDelayMs(99), 6 * 60 * 60 * 1000);
});

test("mocked Google API conflict becomes an idempotent update instead of another insert", async () => {
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });

    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: "already exists" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "managed-event" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await upsertManagedEvent(
    "example-access-value",
    "generated-calendar",
    "cpc12345",
    { summary: "School" },
    false,
    mockFetch,
  );

  assert.deepEqual(calls.map((call) => call.method), ["POST", "PUT"]);
  assert.match(calls[1].url, /cpc12345$/);
  assert.match(calls[1].body ?? "", /"id":"cpc12345"/);
});

test("mocked Google API recreates a linked event that was deleted in Google", async () => {
  const methods: string[] = [];
  const mockFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    if (methods.length === 1) {
      return new Response(JSON.stringify({ error: "missing" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "managed-event" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await upsertManagedEvent(
    "example-access-value",
    "generated-calendar",
    "cpc12345",
    { summary: "Sport" },
    true,
    mockFetch,
  );

  assert.deepEqual(methods, ["PUT", "POST"]);
});

test("mocked Google API treats an already-deleted managed event as deleted", async () => {
  const mockFetch = (async () =>
    new Response(JSON.stringify({ error: "missing" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  await assert.doesNotReject(
    deleteManagedEvent(
      "example-access-value",
      "generated-calendar",
      "cpc12345",
      mockFetch,
    ),
  );
});
