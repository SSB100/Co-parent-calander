-- Stage 9 proposal. Qualify on a fresh Production clone; owner approval is
-- required before applying this migration to Production.
CREATE TABLE staff_roster_break_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  clock_session_id uuid NOT NULL REFERENCES staff_roster_clock_sessions(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  CONSTRAINT staff_roster_break_time_valid CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX staff_roster_break_active_unique
  ON staff_roster_break_sessions(clock_session_id) WHERE ended_at IS NULL;
CREATE INDEX staff_roster_break_session_start_idx
  ON staff_roster_break_sessions(clock_session_id, started_at);

-- Serialize all break writes with clock-out/corrections using the parent row.
-- Separate statements inside this volatile trigger see the state after waiting.
CREATE FUNCTION staff_roster_validate_break() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent staff_roster_clock_sessions%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.clock_session_id <> OLD.clock_session_id THEN
    RAISE EXCEPTION 'Break session cannot be reassigned' USING ERRCODE = '23514', CONSTRAINT = 'staff_roster_break_bounds';
  END IF;
  SELECT * INTO parent FROM staff_roster_clock_sessions WHERE id = NEW.clock_session_id FOR UPDATE;
  IF NOT FOUND OR NEW.started_at < parent.clock_in_at
    OR (TG_OP = 'INSERT' AND parent.clock_out_at IS NOT NULL)
    OR (parent.clock_out_at IS NOT NULL AND (NEW.ended_at IS NULL OR NEW.ended_at > parent.clock_out_at)) THEN
    RAISE EXCEPTION 'Break must stay inside its attendance session' USING ERRCODE = '23514', CONSTRAINT = 'staff_roster_break_bounds';
  END IF;
  IF EXISTS (
    SELECT 1 FROM staff_roster_break_sessions b
    WHERE b.clock_session_id = NEW.clock_session_id AND b.id <> NEW.id
      AND b.started_at < COALESCE(NEW.ended_at, 'infinity'::timestamptz)
      AND NEW.started_at < COALESCE(b.ended_at, 'infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'Break intervals cannot overlap' USING ERRCODE = '23514', CONSTRAINT = 'staff_roster_break_bounds';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_roster_break_bounds_guard BEFORE INSERT OR UPDATE
  ON staff_roster_break_sessions FOR EACH ROW EXECUTE FUNCTION staff_roster_validate_break();

CREATE FUNCTION staff_roster_validate_clock_breaks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM staff_roster_break_sessions b WHERE b.clock_session_id = NEW.id
      AND (b.started_at < NEW.clock_in_at
        OR (NEW.clock_out_at IS NOT NULL AND (b.ended_at IS NULL OR b.ended_at > NEW.clock_out_at)))
  ) THEN
    RAISE EXCEPTION 'Attendance must contain its recorded breaks' USING ERRCODE = '23514', CONSTRAINT = 'staff_roster_break_bounds';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_roster_clock_break_bounds_guard BEFORE UPDATE OF clock_in_at, clock_out_at
  ON staff_roster_clock_sessions FOR EACH ROW EXECUTE FUNCTION staff_roster_validate_clock_breaks();

INSERT INTO covie_schema_migrations(migration_id, description, baseline)
VALUES ('0031', 'Staff roster simple break sessions', false);
