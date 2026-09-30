-- Additive facilities domain. Qualify on a production clone and obtain explicit
-- production migration approval before applying to the main branch.
-- Purpose-specific roles supplement Core membership; they never create parents.
CREATE TABLE template_member_roles (
  calendar_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('manager','admin','member','viewer')),
  resource_ids uuid[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (calendar_id, user_id),
  FOREIGN KEY (calendar_id, user_id) REFERENCES calendar_memberships(calendar_id, user_id) ON DELETE CASCADE
);
CREATE TABLE template_invite_roles (
  invite_id uuid PRIMARY KEY REFERENCES calendar_invites(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('manager','admin','member','viewer')),
  resource_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE TABLE facility_settings (
  calendar_id uuid PRIMARY KEY REFERENCES calendars(id) ON DELETE CASCADE,
  open_minute integer NOT NULL DEFAULT 480,
  close_minute integer NOT NULL DEFAULT 1320,
  open_days integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  min_duration integer NOT NULL DEFAULT 30,
  max_duration integer NOT NULL DEFAULT 240,
  min_notice_hours integer NOT NULL DEFAULT 0,
  advance_days integer NOT NULL DEFAULT 90,
  cancellation_hours integer NOT NULL DEFAULT 0,
  max_active_bookings integer NOT NULL DEFAULT 10,
  require_approval boolean NOT NULL DEFAULT false,
  share_titles boolean NOT NULL DEFAULT false,
  CONSTRAINT facility_rules_valid CHECK (
    open_minute >= 0 AND close_minute <= 1440 AND open_minute < close_minute
    AND min_duration >= 15 AND max_duration >= min_duration AND max_duration <= 1440
    AND min_duration <= close_minute - open_minute
    AND min_notice_hours BETWEEN 0 AND 720 AND advance_days BETWEEN 1 AND 365
    AND cancellation_hours BETWEEN 0 AND 720 AND max_active_bookings BETWEEN 1 AND 100
    AND cardinality(open_days) BETWEEN 1 AND 7 AND open_days <@ ARRAY[0,1,2,3,4,5,6])
);
CREATE TABLE facility_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
  description varchar(1000) NOT NULL DEFAULT '',
  location varchar(160) NOT NULL DEFAULT '',
  capacity integer CHECK (capacity BETWEEN 1 AND 10000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, calendar_id)
);
CREATE UNIQUE INDEX facility_resource_name_unique ON facility_resources(calendar_id, lower(name)) WHERE active;
CREATE TABLE facility_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  request_key uuid NOT NULL DEFAULT gen_random_uuid(),
  UNIQUE (calendar_id, user_id, request_key),
  title varchar(120) NOT NULL DEFAULT '',
  notes varchar(2000) NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','cancelled','declined')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_booking_resource_tenant FOREIGN KEY (resource_id, calendar_id) REFERENCES facility_resources(id, calendar_id),
  CONSTRAINT facility_booking_time_valid CHECK (end_at > start_at)
);
CREATE INDEX facility_bookings_calendar_time_idx ON facility_bookings(calendar_id, start_at);
CREATE INDEX facility_bookings_resource_time_idx ON facility_bookings(resource_id, start_at) WHERE status = 'confirmed';
CREATE TABLE facility_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES facility_bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX facility_updates_calendar_created_idx ON facility_updates(calendar_id, created_at);

CREATE FUNCTION facility_validate_booking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  member_permission calendar_permission;
  actor_permission calendar_permission;
  actor_manager boolean;
  resource_active boolean;
  rules facility_settings%ROWTYPE;
  zone text;
  local_start timestamp;
  local_end timestamp;
  duration numeric;
  time_changed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.calendar_id <> OLD.calendar_id OR NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'A booking cannot change calendar or member.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope';
  END IF;
  -- Consistent lock order serializes the per-member limit, then resource conflicts.
  SELECT permission INTO member_permission FROM calendar_memberships
    WHERE calendar_id = NEW.calendar_id AND user_id = NEW.user_id FOR UPDATE;
  SELECT permission INTO actor_permission FROM calendar_memberships
    WHERE calendar_id = NEW.calendar_id AND user_id = NEW.updated_by_user_id;
  SELECT EXISTS(SELECT 1 FROM template_member_roles m WHERE m.calendar_id=NEW.calendar_id AND m.user_id=NEW.updated_by_user_id
    AND m.role='manager' AND NEW.resource_id=ANY(m.resource_ids)) INTO actor_manager;
  IF actor_permission IS NULL OR actor_permission = 'viewer'
    OR (actor_permission <> 'owner' AND NOT actor_manager AND NEW.updated_by_user_id <> NEW.user_id) THEN
    RAISE EXCEPTION 'You cannot change this booking.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope';
  END IF;
  SELECT timezone INTO zone FROM calendars WHERE id = NEW.calendar_id AND calendar_type = 'shared_facilities' AND archived_at IS NULL;
  IF zone IS NULL THEN RAISE EXCEPTION 'Choose an active facilities calendar.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope'; END IF;
  SELECT active INTO resource_active FROM facility_resources WHERE id = NEW.resource_id AND calendar_id = NEW.calendar_id FOR UPDATE;
  IF resource_active IS NULL THEN RAISE EXCEPTION 'Choose a resource in this calendar.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope'; END IF;
  INSERT INTO facility_settings(calendar_id) VALUES (NEW.calendar_id) ON CONFLICT DO NOTHING;
  SELECT * INTO rules FROM facility_settings WHERE calendar_id = NEW.calendar_id;
  IF TG_OP = 'UPDATE' THEN
    time_changed := NEW.resource_id <> OLD.resource_id OR NEW.start_at <> OLD.start_at OR NEW.end_at <> OLD.end_at;
    IF OLD.status IN ('cancelled','declined') THEN RAISE EXCEPTION 'This booking has already ended. Make a new booking.' USING ERRCODE='23514', CONSTRAINT='facility_booking_rules'; END IF;
    IF actor_permission <> 'owner' AND NOT actor_manager AND OLD.start_at <= now() + make_interval(hours => rules.cancellation_hours) THEN
      RAISE EXCEPTION 'The change or cancellation cutoff has passed. Contact the organiser.' USING ERRCODE='23514', CONSTRAINT='facility_booking_rules';
    END IF;
    IF actor_permission <> 'owner' AND NOT actor_manager AND NEW.status NOT IN ('cancelled', CASE WHEN rules.require_approval THEN 'pending' ELSE 'confirmed' END) THEN
      RAISE EXCEPTION 'The organiser must review this booking.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope';
    END IF;
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  ELSE
    time_changed := true;
    IF member_permission IS NULL OR member_permission = 'viewer' OR NEW.updated_by_user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Calendar member access is required to book.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope';
    END IF;
    IF NEW.status <> (CASE WHEN rules.require_approval AND actor_permission <> 'owner' AND NOT actor_manager THEN 'pending' ELSE 'confirmed' END) THEN
      RAISE EXCEPTION 'This booking requires the configured approval flow.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope';
    END IF;
  END IF;
  IF NEW.status IN ('cancelled','declined') THEN
    IF NEW.status = 'declined' AND actor_permission <> 'owner' AND NOT actor_manager THEN RAISE EXCEPTION 'Only the organiser can decline a booking.' USING ERRCODE='23514', CONSTRAINT='facility_booking_scope'; END IF;
    RETURN NEW;
  END IF;
  IF NOT resource_active THEN RAISE EXCEPTION 'This resource is archived. Choose another resource.' USING ERRCODE='23514', CONSTRAINT='facility_booking_rules'; END IF;
  local_start := NEW.start_at AT TIME ZONE zone;
  local_end := NEW.end_at AT TIME ZONE zone;
  duration := extract(epoch FROM NEW.end_at - NEW.start_at) / 60;
  IF time_changed THEN
    IF NEW.start_at < now() + make_interval(hours => rules.min_notice_hours)
      OR local_start::date > (now() AT TIME ZONE zone)::date + rules.advance_days THEN
      RAISE EXCEPTION 'Choose a time inside the booking notice and advance window.' USING ERRCODE='23514', CONSTRAINT='facility_booking_rules'; END IF;
    IF duration < rules.min_duration OR duration > rules.max_duration THEN
      RAISE EXCEPTION 'Choose a duration within the booking rules.' USING ERRCODE='23514', CONSTRAINT='facility_booking_rules'; END IF;
    IF extract(dow FROM local_start)::int <> ALL(rules.open_days)
      OR local_start < local_start::date + make_interval(mins => rules.open_minute)
      OR local_end > local_start::date + make_interval(mins => rules.close_minute) THEN
      RAISE EXCEPTION 'Choose a time during opening hours.' USING ERRCODE='23514', CONSTRAINT='facility_booking_rules'; END IF;
  END IF;
  IF NEW.status = 'confirmed' AND EXISTS (
    SELECT 1 FROM facility_bookings WHERE resource_id = NEW.resource_id AND id <> NEW.id AND status = 'confirmed'
      AND start_at < NEW.end_at AND NEW.start_at < end_at
  ) THEN RAISE EXCEPTION 'This resource is already booked at that time. Choose another slot.' USING ERRCODE='23514', CONSTRAINT='facility_booking_overlap'; END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM facility_bookings WHERE calendar_id = NEW.calendar_id AND user_id = NEW.user_id
    AND status IN ('pending','confirmed') AND end_at > now()) >= rules.max_active_bookings THEN
    RAISE EXCEPTION 'You have reached the active booking limit.' USING ERRCODE='23514', CONSTRAINT='facility_booking_rules'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER facility_booking_guard BEFORE INSERT OR UPDATE ON facility_bookings FOR EACH ROW EXECUTE FUNCTION facility_validate_booking();
CREATE FUNCTION facility_record_booking_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO facility_updates(calendar_id, booking_id, user_id, action)
    VALUES (NEW.calendar_id, NEW.id, NEW.user_id,
      CASE WHEN TG_OP='INSERT' THEN 'created' WHEN NEW.status <> OLD.status THEN NEW.status ELSE 'updated' END);
  RETURN NEW;
END; $$;
CREATE TRIGGER facility_booking_update AFTER INSERT OR UPDATE ON facility_bookings FOR EACH ROW EXECUTE FUNCTION facility_record_booking_update();
INSERT INTO covie_schema_migrations(migration_id, description, baseline) VALUES ('0033', 'Shared facilities resources, rules and bookings', false);
