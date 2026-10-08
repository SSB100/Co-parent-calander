import assert from "node:assert/strict";
import { test } from "node:test";
import { salonSetupModel } from "../components/salon/salon-setup-model";
import { salonDefaults, type SalonData } from "../lib/salon/contracts";

function fixture(): SalonData {
  return { calendarId: "calendar", date: "2026-10-08", timezone: "UTC", role: "owner", ownPractitionerId: "person", canOrganise: true, canPublish: true,
    settings: salonDefaults, practitioners: [{ id: "person", displayName: "A practitioner", bio: "", kind: "staff", role: "owner", active: true, bookable: true, own: true, serviceIds: ["service"] }],
    services: [{ id: "service", name: "A service", description: "", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, priceMinor: null, currency: "NZD", active: true, bookable: true }],
    hours: [{ id: "hours", practitionerId: "person", weekday: 1, startMinute: 540, endMinute: 1020 }],
    timeBlocks: [], appointments: [], appointmentsTruncated: false, updates: [], invitations: [],
  };
}

test("readiness describes saved configuration without asserting available slots or publication", () => {
  const current = fixture(); const model = salonSetupModel(current);
  assert.equal(model.canCheckTimes, true); assert.equal(model.publiclyConfigured, true);
  assert.equal(current.settings.publicEnabled, false); assert.deepEqual(model.next, { panel: "book", label: "Check available times" });
  assert.equal("slots" in model, false); assert.equal("readyToPublish" in model, false);
});

test("next setup action follows practitioner, service, assignment and hours dependencies", () => {
  const current = fixture(); current.practitioners = []; assert.equal(salonSetupModel(current).next.label, "Add a practitioner");
  current.practitioners = fixture().practitioners; current.services = []; assert.equal(salonSetupModel(current).next.label, "Add a service");
  current.services = fixture().services; current.practitioners[0].serviceIds = ["missing"]; assert.equal(salonSetupModel(current).next.label, "Assign services");
  current.practitioners[0].serviceIds = ["service"]; current.hours = []; assert.equal(salonSetupModel(current).next.label, "Set working hours");
});

test("inactive services, inactive practitioners and hours on another person never create readiness", () => {
  let current = fixture(); current.services[0].active = false; assert.equal(salonSetupModel(current).canCheckTimes, false);
  current = fixture(); current.practitioners[0].active = false; assert.equal(salonSetupModel(current).canCheckTimes, false);
  current = fixture(); current.hours[0].practitionerId = "another"; assert.equal(salonSetupModel(current).canCheckTimes, false);
});

test("online readiness requires online settings along the same connected service/practitioner path", () => {
  let current = fixture(); current.services[0].bookable = false; assert.equal(salonSetupModel(current).publiclyConfigured, false); assert.equal(salonSetupModel(current).canCheckTimes, true);
  current = fixture(); current.practitioners[0].bookable = false; assert.equal(salonSetupModel(current).publiclyConfigured, false);
  current = fixture(); current.hours[0].endMinute = current.hours[0].startMinute; assert.equal(salonSetupModel(current).publiclyConfigured, false);
});
