import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calendarPurposes, googleCalendarNote } from "../components/marketing/calendar-purpose-content";
import { calendarTemplateIds, calendarTemplateManifests } from "../lib/templates/calendar-templates";

const palette = { coral: "#FF6B5F", teal: "#19A897", sunshine: "#F4C64E", violet: "#765ED6" };

test("marketing covers exactly the supported purposes and authoritative accent pairs", () => {
  assert.deepEqual(calendarPurposes.map((purpose) => purpose.id), ["staff_rosters", "salon_bookings", "shared_facilities", "social_groups", "co_parenting"]);
  assert.deepEqual(new Set(calendarPurposes.map((purpose) => purpose.id)), new Set(calendarTemplateIds));
  for (const purpose of calendarPurposes) {
    const manifest = calendarTemplateManifests[purpose.id];
    assert.equal(purpose.name, manifest.name);
    assert.deepEqual([purpose.primary, purpose.secondary], manifest.accentPair.map((accent) => palette[accent]));
    assert.equal(purpose.primaryText, purpose.primary === palette.violet ? "#FFFFFF" : "#243139");
    assert.equal(purpose.exampleEntries.length, 3);
    assert.equal(new Set(purpose.exampleEntries.map((entry) => entry.date)).size, purpose.exampleEntries.length);
    assert.ok(purpose.description.length > 0);
    assert.ok(purpose.uses.every((use) => use.length > 0));
  }
});

test("Google copy clearly describes optional one-way output and Covie authority", () => {
  assert.match(googleCalendarNote, /^For co-parenting calendars, Google Calendar is optional, one-way output from Covie/);
  assert.match(googleCalendarNote, /Covie stays the source of truth/);
  assert.match(googleCalendarNote, /changes in Google Calendar do not update Covie/);
});

test("purpose selection is a local accessible preview without fabricated signup state", async () => {
  const picker = await readFile("components/marketing/calendar-purpose-picker.tsx", "utf8");
  const home = await readFile("components/marketing/ecosystem-home.tsx", "utf8");
  assert.match(home, /Start with the calendar you need. Add another when it helps/);
  assert.match(picker, /type="button"/);
  assert.match(picker, /aria-pressed=\{selectedId === purpose.id\}/);
  assert.match(picker, /onClick=\{\(\) => setSelectedId\(purpose.id\)\}/);
  assert.match(picker, /aria-controls="calendar-purpose-detail"/);
  assert.match(picker, /id="calendar-purpose-detail"/);
  assert.match(picker, /aria-live="polite"/);
  assert.match(picker, /Illustrative plan with example people and events/);
  assert.match(picker, /Choose your calendar type after creating an account/);
  assert.doesNotMatch(picker, /fetch\(|localStorage|sessionStorage/);
  assert.doesNotMatch(home + picker, /\/auth\/sign-up\?/);
  assert.equal((home.match(/href="\/auth\/sign-up"/g) ?? []).length, 2);
});

test("marketing avoids payment, sports, payroll and unverified traction promises", () => {
  const copy = JSON.stringify(calendarPurposes);
  assert.doesNotMatch(copy, /accept payments|payment processing|paid bookings|payroll|sports calendar|trusted by|thousands of|two-way/i);
  assert.doesNotMatch(copy, /Covey|—/);
});

test("released Social tools no longer carry the development note",()=>{
  assert.equal(calendarPurposes.find(p=>p.id === "social_groups")?.availabilityNote,undefined);
});


test("public copy leads with Staff Rosters and keeps Co-parenting last", async () => {
  const [picker, home, ...descriptions] = await Promise.all([
    "components/marketing/calendar-purpose-picker.tsx",
    "components/marketing/ecosystem-home.tsx",
    "app/page.tsx", "app/layout.tsx", "app/manifest.ts", "app/help/page.tsx",
    "components/marketing/public-chrome.tsx",
  ].map((file) => readFile(file, "utf8")));
  assert.match(picker, /useState<CalendarPurpose\["id"\]>\("staff_rosters"\)/);
  assert.match(picker, /purposeIcons\[purpose.id\]/);
  for (const [id, icon] of Object.entries({ staff_rosters: "Clock3", salon_bookings: "Scissors", shared_facilities: "Building2", social_groups: "UsersRound", co_parenting: "CalendarDays" })) {
    assert.ok(picker.includes(`${id}: ${icon}`));
  }
  assert.doesNotMatch(picker, /purposeIcons\[index\]/);
  assert.match(home, /Team shifts\. Client appointments\. Shared spaces\. Time together\. Parenting days\./);
  assert.match(home, /A team needs shifts\. A salon needs appointments\. A shared space needs bookings\. A group needs get-togethers\. Co-parents need handovers\./);
  assert.match(home, /calendarPurposes.map/);
  for (const source of descriptions) {
    assert.match(source, /Staff Rosters, Salon Bookings, Shared Facilities, Social Groups (?:and|or) Co-parenting/);
    assert.doesNotMatch(source, /Co-parenting, Staff Rosters/);
  }
});
