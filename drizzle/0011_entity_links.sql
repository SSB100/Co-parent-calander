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
    CHECK (NOT ("left_type" = "right_type" AND "left_id" = "right_id")),
  CONSTRAINT "entity_link_canonical"
    CHECK (
      "left_type" < "right_type"
      OR ("left_type" = "right_type" AND "left_id"::text < "right_id"::text)
    )
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

CREATE FUNCTION "cleanup_entity_links_for_deleted_record"()
RETURNS trigger
LANGUAGE plpgsql
AS '
BEGIN
  DELETE FROM "entity_links"
  WHERE "calendar_id" = OLD."calendar_id"
    AND (
      ("left_type" = TG_ARGV[0]::linked_entity_type AND "left_id" = OLD."id")
      OR
      ("right_type" = TG_ARGV[0]::linked_entity_type AND "right_id" = OLD."id")
    );

  RETURN OLD;
END;
';

CREATE TRIGGER "cleanup_event_entity_links"
  BEFORE DELETE ON "events"
  FOR EACH ROW EXECUTE FUNCTION "cleanup_entity_links_for_deleted_record"('event');

CREATE TRIGGER "cleanup_expense_entity_links"
  BEFORE DELETE ON "expenses"
  FOR EACH ROW EXECUTE FUNCTION "cleanup_entity_links_for_deleted_record"('expense');

CREATE TRIGGER "cleanup_responsibility_entity_links"
  BEFORE DELETE ON "responsibilities"
  FOR EACH ROW EXECUTE FUNCTION "cleanup_entity_links_for_deleted_record"('responsibility');

CREATE TRIGGER "cleanup_child_entity_links"
  BEFORE DELETE ON "children"
  FOR EACH ROW EXECUTE FUNCTION "cleanup_entity_links_for_deleted_record"('child');
