import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalEntityLink,
  createEntityLinkSchema,
  linkedEntitySchema,
} from "@/lib/links/model";

const eventId = "11111111-1111-4111-8111-111111111111";
const expenseId = "22222222-2222-4222-8222-222222222222";
const childA = "33333333-3333-4333-8333-333333333333";
const childB = "44444444-4444-4444-8444-444444444444";

test("canonical entity links produce the same stored direction from either side", () => {
  const forward = canonicalEntityLink({
    leftType: "event",
    leftId: eventId,
    rightType: "expense",
    rightId: expenseId,
  });
  const reverse = canonicalEntityLink({
    leftType: "expense",
    leftId: expenseId,
    rightType: "event",
    rightId: eventId,
  });

  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward, {
    leftType: "event",
    leftId: eventId,
    rightType: "expense",
    rightId: expenseId,
  });
});

test("same-type links use UUID ordering for a stable canonical pair", () => {
  assert.deepEqual(
    canonicalEntityLink({
      leftType: "child",
      leftId: childB,
      rightType: "child",
      rightId: childA,
    }),
    {
      leftType: "child",
      leftId: childA,
      rightType: "child",
      rightId: childB,
    },
  );
});

test("linked source schema accepts event expense responsibility and child only", () => {
  assert.equal(
    linkedEntitySchema.safeParse({
      entityType: "event",
      entityId: eventId,
    }).success,
    true,
  );
  assert.equal(
    linkedEntitySchema.safeParse({
      entityType: "attachment",
      entityId: eventId,
    }).success,
    false,
  );
});

test("link creation allows a document as the target", () => {
  assert.equal(
    createEntityLinkSchema.safeParse({
      entityType: "expense",
      entityId: expenseId,
      targetType: "attachment",
      targetId: eventId,
    }).success,
    true,
  );
});
