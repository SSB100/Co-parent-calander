CREATE TYPE "linked_entity_type" AS ENUM (
  'event',
  'expense',
  'responsibility',
  'child'
);

CREATE TABLE "entity_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "left_type" "linked_entity_type" NOT NULL,
  "left_id" uuid NOT NULL,
  "right_type" "linked_entity_type" NOT NULL,
  "right_id" uuid NOT NULL,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "entity_link_not_self"
    CHECK (NOT ("left_type" = "right_type" AND "left_id" = "right_id"))
);

CREATE UNIQUE INDEX "entity_links_unique"
  ON "entity_links" (
    "calendar_id",
    "left_type",
    "left_id",
    "right_type",
    "right_id"
  );

CREATE INDEX "entity_links_left_idx"
  ON "entity_links" ("calendar_id", "left_type", "left_id");

CREATE INDEX "entity_links_right_idx"
  ON "entity_links" ("calendar_id", "right_type", "right_id");
