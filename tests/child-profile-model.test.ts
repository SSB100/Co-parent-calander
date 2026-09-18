import assert from "node:assert/strict";
import test from "node:test";
import {
  childActivitySchema,
  childProfileSchema,
  changedActivityFields,
  changedProfileFields,
  historySummary,
} from "@/lib/children/profile";

function profile() {
  return {
    displayName: "Drake",
    fullName: "Drake Example",
    dateOfBirth: "2018-04-05",
    schoolName: "Example School",
    yearClass: "Year 3",
    teacherName: null,
    schoolPhone: null,
    schoolEmail: null,
    studentId: null,
    careDetails: null,
    schoolNotes: null,
    gpName: null,
    dentistName: null,
    allergies: null,
    medications: null,
    medicalNotes: null,
    nhiNumber: null,
    clothingSize: null,
    shoeSize: null,
    uniformSize: null,
    practicalNotes: null,
  };
}

test("child profile accepts optional school health and practical fields", () => {
  const parsed = childProfileSchema.safeParse({
    ...profile(),
    allergies: "Peanuts",
    medications: "Inhaler",
    shoeSize: "3",
  });
  assert.equal(parsed.success, true);
});

test("child profile validates email and preferred name", () => {
  assert.equal(
    childProfileSchema.safeParse({
      ...profile(),
      displayName: "",
    }).success,
    false,
  );
  assert.equal(
    childProfileSchema.safeParse({
      ...profile(),
      schoolEmail: "not-an-email",
    }).success,
    false,
  );
});

test("changed profile fields reports only changed field names", () => {
  const before = profile();
  const after = {
    ...before,
    teacherName: "Ms Taylor",
    medications: "Inhaler",
  };
  assert.deepEqual(changedProfileFields(before, after), [
    "teacherName",
    "medications",
  ]);
});

test("activity validation and change tracking stay lightweight", () => {
  const before = {
    activityName: "Football",
    organisation: "City FC",
    contactName: null,
    contactDetails: null,
    location: "Domain",
    scheduleInfo: "Saturday mornings",
    notes: null,
  };
  assert.equal(childActivitySchema.safeParse(before).success, true);
  assert.deepEqual(
    changedActivityFields(before, { ...before, location: "School field" }),
    ["location"],
  );
});

test("history summary describes changed fields without reproducing values", () => {
  assert.equal(
    historySummary({
      action: "child_profile.update",
      details: { changedFields: ["allergies", "teacherName"] },
    }),
    "Updated Allergies, Teacher",
  );
  assert.equal(
    historySummary({
      action: "child_activity.create",
      details: { activityName: "Football" },
    }),
    "Added Football",
  );
});
