CREATE TYPE "proposal_action" AS ENUM ('create', 'edit', 'delete');
CREATE TYPE "proposal_status" AS ENUM ('draft', 'waiting', 'approved', 'declined', 'withdrawn');

CREATE TABLE "approval_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE cascade,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" varchar(255) NOT NULL,
  "action" "proposal_action" NOT NULL,
  "proposed_by_membership_id" uuid NOT NULL REFERENCES "calendar_memberships"("id") ON DELETE restrict,
  "proposed_by_participant_id" uuid REFERENCES "participants"("id") ON DELETE set null,
  "approver_membership_id" uuid REFERENCES "calendar_memberships"("id") ON DELETE restrict,
  "approver_participant_id" uuid REFERENCES "participants"("id") ON DELETE set null,
  "reason" text,
  "previous_state" jsonb,
  "proposed_state" jsonb,
  "status" "proposal_status" DEFAULT 'draft' NOT NULL,
  "submitted_at" timestamp with time zone,
  "responded_at" timestamp with time zone,
  "decline_reason" text,
  "withdrawn_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "approval_proposals_calendar_status_idx"
  ON "approval_proposals" ("calendar_id", "status");
CREATE INDEX "approval_proposals_entity_idx"
  ON "approval_proposals" ("calendar_id", "entity_type", "entity_id");
CREATE INDEX "approval_proposals_approver_idx"
  ON "approval_proposals" ("approver_membership_id", "status");
CREATE UNIQUE INDEX "approval_proposal_waiting_entity_unique"
  ON "approval_proposals" ("calendar_id", "entity_type", "entity_id")
  WHERE "status" = 'waiting';

CREATE TABLE "approval_proposal_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "proposal_id" uuid NOT NULL REFERENCES "approval_proposals"("id") ON DELETE cascade,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE cascade,
  "actor_membership_id" uuid REFERENCES "calendar_memberships"("id") ON DELETE set null,
  "actor_participant_id" uuid REFERENCES "participants"("id") ON DELETE set null,
  "event_type" varchar(64) NOT NULL,
  "from_status" "proposal_status",
  "to_status" "proposal_status",
  "details" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "approval_history_proposal_time_idx"
  ON "approval_proposal_history" ("proposal_id", "occurred_at");
CREATE INDEX "approval_history_calendar_time_idx"
  ON "approval_proposal_history" ("calendar_id", "occurred_at");
