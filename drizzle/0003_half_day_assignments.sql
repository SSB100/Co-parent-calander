ALTER TABLE "parenting_assignments"
  ADD COLUMN "afternoon_parent_id" uuid;

ALTER TABLE "parenting_assignments"
  ADD CONSTRAINT "parenting_assignments_afternoon_parent_id_participants_id_fk"
  FOREIGN KEY ("afternoon_parent_id")
  REFERENCES "participants"("id")
  ON DELETE restrict;

UPDATE "parenting_assignments"
SET "afternoon_parent_id" = "parent_id"
WHERE "afternoon_parent_id" IS NULL;

CREATE INDEX "assignment_afternoon_parent_idx"
  ON "parenting_assignments" ("afternoon_parent_id");
