-- Additive Salon domain. Qualify only on the authorized isolated development
-- branch with synthetic records. This file never updates existing domain data.
-- Functions are SECURITY INVOKER. The application supplies authenticated actor
-- UUIDs; browser input must never supply an actor or a client account UUID.
ALTER TYPE calendar_type ADD VALUE IF NOT EXISTS 'salon_bookings';

CREATE TABLE salon_settings (
 calendar_id uuid PRIMARY KEY REFERENCES calendars(id) ON DELETE CASCADE,
 business_name varchar(120) NOT NULL DEFAULT '',
 description varchar(1000) NOT NULL DEFAULT '', location varchar(200) NOT NULL DEFAULT '',
 public_enabled boolean NOT NULL DEFAULT false,
 lead_minutes integer NOT NULL DEFAULT 60 CHECK (lead_minutes BETWEEN 0 AND 43200),
 advance_days integer NOT NULL DEFAULT 90 CHECK (advance_days BETWEEN 1 AND 365),
 slot_minutes integer NOT NULL DEFAULT 15 CHECK (slot_minutes IN (5,10,15,20,30,60)),
 cancellation_hours integer NOT NULL DEFAULT 24 CHECK (cancellation_hours BETWEEN 0 AND 720),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE salon_practitioners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 user_id uuid,
 role varchar(16) NOT NULL CHECK (role IN ('owner','manager','practitioner')),
 display_name varchar(100) NOT NULL CHECK (length(trim(display_name)) > 0),
 bio varchar(500) NOT NULL DEFAULT '',
 kind varchar(16) NOT NULL DEFAULT 'staff' CHECK (kind IN ('staff','contractor')),
 active boolean NOT NULL DEFAULT true, bookable boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,calendar_id), UNIQUE (calendar_id,user_id),
 -- Membership removal preserves appointment history and permanently disconnects
 -- the old profile. It does not silently connect a future account by email.
 CONSTRAINT salon_practitioner_membership_tenant FOREIGN KEY (calendar_id,user_id)
  REFERENCES calendar_memberships(calendar_id,user_id) ON DELETE SET NULL (user_id)
);
CREATE INDEX salon_practitioners_user_idx ON salon_practitioners(user_id) WHERE user_id IS NOT NULL;
CREATE TABLE salon_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
 description varchar(1000) NOT NULL DEFAULT '',
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720),
 buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 240),
 buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 240),
 price_minor integer CHECK (price_minor BETWEEN 0 AND 10000000),
 currency varchar(3) NOT NULL DEFAULT 'NZD' CHECK (currency ~ '^[A-Z]{3}$'),
 active boolean NOT NULL DEFAULT true, bookable boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,calendar_id)
);
CREATE INDEX salon_services_calendar_idx ON salon_services(calendar_id);
CREATE TABLE salon_practitioner_services (
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 practitioner_id uuid NOT NULL, service_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY (practitioner_id,service_id),
 FOREIGN KEY (practitioner_id,calendar_id) REFERENCES salon_practitioners(id,calendar_id),
 FOREIGN KEY (service_id,calendar_id) REFERENCES salon_services(id,calendar_id)
);
CREATE INDEX salon_practitioner_services_calendar_idx ON salon_practitioner_services(calendar_id);
CREATE TABLE salon_working_hours (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 practitioner_id uuid NOT NULL,
 weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
 start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
 end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
 active boolean NOT NULL DEFAULT true,
 CHECK (end_minute > start_minute),
 UNIQUE (practitioner_id,weekday,start_minute,end_minute),
 FOREIGN KEY (practitioner_id,calendar_id) REFERENCES salon_practitioners(id,calendar_id)
);
CREATE INDEX salon_working_hours_calendar_idx ON salon_working_hours(calendar_id,practitioner_id) WHERE active;
CREATE TABLE salon_time_blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 practitioner_id uuid NOT NULL,
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
 reason varchar(500) NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 created_by_user_id uuid NOT NULL, updated_by_user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (end_at > start_at AND isfinite(start_at) AND isfinite(end_at)),
 FOREIGN KEY (practitioner_id,calendar_id) REFERENCES salon_practitioners(id,calendar_id)
);
CREATE INDEX salon_time_blocks_practitioner_time_idx ON salon_time_blocks(calendar_id,practitioner_id,start_at) WHERE active;
CREATE TABLE salon_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 practitioner_id uuid NOT NULL, service_id uuid NOT NULL,
 client_user_id uuid, created_by_user_id uuid NOT NULL, updated_by_user_id uuid NOT NULL,
 request_key uuid NOT NULL, request_payload jsonb NOT NULL,
 client_name varchar(100) NOT NULL CHECK (length(trim(client_name)) > 0),
 client_email varchar(254) NOT NULL DEFAULT '', client_phone varchar(40) NOT NULL DEFAULT '',
 notes varchar(2000) NOT NULL DEFAULT '',
 service_name varchar(120) NOT NULL,
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720),
 buffer_before_minutes integer NOT NULL CHECK (buffer_before_minutes BETWEEN 0 AND 240),
 buffer_after_minutes integer NOT NULL CHECK (buffer_after_minutes BETWEEN 0 AND 240),
 price_minor integer CHECK (price_minor BETWEEN 0 AND 10000000),
 currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 cancellation_hours integer NOT NULL CHECK (cancellation_hours BETWEEN 0 AND 720),
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
 busy_start_at timestamptz NOT NULL, busy_end_at timestamptz NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
 version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,calendar_id), UNIQUE (calendar_id,created_by_user_id,request_key),
 FOREIGN KEY (practitioner_id,calendar_id) REFERENCES salon_practitioners(id,calendar_id),
 FOREIGN KEY (service_id,calendar_id) REFERENCES salon_services(id,calendar_id),
 CONSTRAINT salon_appointment_time_valid CHECK (
  isfinite(start_at) AND isfinite(end_at) AND isfinite(busy_start_at) AND isfinite(busy_end_at)
  AND end_at = start_at + duration_minutes * interval '1 minute'
  AND busy_start_at = start_at - buffer_before_minutes * interval '1 minute'
  AND busy_end_at = end_at + buffer_after_minutes * interval '1 minute')
);
CREATE INDEX salon_appointments_calendar_time_idx ON salon_appointments(calendar_id,start_at);
CREATE INDEX salon_appointments_practitioner_time_idx ON salon_appointments(calendar_id,practitioner_id,busy_start_at) WHERE status='confirmed';
CREATE INDEX salon_appointments_client_time_idx ON salon_appointments(client_user_id,start_at) WHERE client_user_id IS NOT NULL;
CREATE TABLE salon_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 appointment_id uuid NOT NULL, user_id uuid NOT NULL,
 action varchar(40) NOT NULL CHECK (action IN ('created','rescheduled','cancelled')),
 version integer NOT NULL,
 previous_start_at timestamptz, start_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (appointment_id,calendar_id) REFERENCES salon_appointments(id,calendar_id)
);
CREATE INDEX salon_updates_calendar_created_idx ON salon_updates(calendar_id,created_at);
CREATE UNIQUE INDEX salon_updates_appointment_version_unique ON salon_updates(appointment_id,version);
-- The existing invitation id is already globally unique; this additive index
-- permits the typed invitation to assert its calendar at the FK boundary.
CREATE UNIQUE INDEX calendar_invites_id_calendar_unique ON calendar_invites(id,calendar_id);
CREATE TABLE salon_invite_roles (
 invite_id uuid PRIMARY KEY, calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 role varchar(16) NOT NULL CHECK (role IN ('manager','practitioner')),
 display_name varchar(100) NOT NULL CHECK (length(trim(display_name)) > 0),
 kind varchar(16) NOT NULL DEFAULT 'staff' CHECK (kind IN ('staff','contractor')),
 FOREIGN KEY (invite_id,calendar_id) REFERENCES calendar_invites(id,calendar_id) ON DELETE CASCADE
);
CREATE INDEX salon_invite_roles_calendar_idx ON salon_invite_roles(calendar_id);

-- Universal serialization point, also used before any authority recheck.
CREATE FUNCTION salon_lock_calendar(p_calendar uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE zone text;
BEGIN
 SELECT timezone INTO zone FROM calendars
 WHERE id=p_calendar AND calendar_type::text='salon_bookings' AND archived_at IS NULL FOR UPDATE;
 IF zone IS NULL THEN
  RAISE EXCEPTION 'Choose an active Salon calendar.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
 END IF;
 RETURN zone;
END; $$;

-- Ownership comes only from Core. Other roles require a current editor
-- membership and an explicitly linked, active Salon profile.
CREATE FUNCTION salon_actor_role(p_calendar uuid,p_actor uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN m.permission='owner' THEN 'owner'
  WHEN m.permission='editor' AND p.active THEN CASE WHEN p.role='manager' THEN 'manager' ELSE 'practitioner' END
  ELSE NULL END
 FROM calendar_memberships m
 LEFT JOIN salon_practitioners p ON p.calendar_id=m.calendar_id AND p.user_id=m.user_id
 WHERE m.calendar_id=p_calendar AND m.user_id=p_actor
$$;

-- Generic Core membership and invite writes take the same serialization lock.
-- Other calendar presets are a no-op; no existing records are modified here.
CREATE FUNCTION salon_serialize_core_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM 1 FROM calendars WHERE id=NEW.calendar_id AND calendar_type::text='salon_bookings' FOR UPDATE;
 ELSIF TG_OP='DELETE' THEN
  PERFORM 1 FROM calendars WHERE id=OLD.calendar_id AND calendar_type::text='salon_bookings' FOR UPDATE;
 ELSE
  PERFORM 1 FROM calendars WHERE id IN (OLD.calendar_id,NEW.calendar_id)
   AND calendar_type::text='salon_bookings' ORDER BY id FOR UPDATE;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER salon_membership_serialization BEFORE INSERT OR UPDATE OR DELETE ON calendar_memberships
 FOR EACH ROW EXECUTE FUNCTION salon_serialize_core_mutation();
CREATE TRIGGER salon_invite_serialization BEFORE INSERT OR UPDATE OR DELETE ON calendar_invites
 FOR EACH ROW EXECUTE FUNCTION salon_serialize_core_mutation();

-- Direct trusted maintenance writes also obey the lock order. Application
-- mutations must use the boundary functions below for actor authorization.
CREATE FUNCTION salon_serialize_domain_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; old_data jsonb; target_calendar uuid; target_practitioner uuid;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 target_calendar:=(row_data->>'calendar_id')::uuid;
 IF TG_OP='UPDATE' THEN
  old_data:=to_jsonb(OLD);
  IF (old_data->>'calendar_id')::uuid<>target_calendar THEN
   RAISE EXCEPTION 'Salon records cannot change calendar.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
  END IF;
 END IF;
 PERFORM 1 FROM calendars WHERE id=target_calendar AND calendar_type::text='salon_bookings' FOR UPDATE;
 IF NOT FOUND AND TG_OP<>'DELETE' THEN
  RAISE EXCEPTION 'Choose a Salon calendar.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
 END IF;
 target_practitioner:=NULLIF(row_data->>'practitioner_id','')::uuid;
 IF target_practitioner IS NOT NULL THEN
  PERFORM 1 FROM salon_practitioners WHERE id=target_practitioner AND calendar_id=target_calendar FOR UPDATE;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['salon_settings','salon_practitioners','salon_services','salon_practitioner_services',
  'salon_working_hours','salon_time_blocks','salon_appointments','salon_updates','salon_invite_roles'] LOOP
  EXECUTE format('CREATE TRIGGER salon_serialization BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION salon_serialize_domain_mutation()',table_name);
 END LOOP;
END; $$;

CREATE FUNCTION salon_check_slot(p_calendar uuid,p_practitioner uuid,p_service uuid,p_start timestamptz,
 p_duration integer,p_before integer,p_after integer,p_public boolean,p_exclude uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE zone text; practitioner salon_practitioners%ROWTYPE; service salon_services%ROWTYPE;
 rules salon_settings%ROWTYPE; local_start timestamp;
 busy_start timestamptz; busy_end timestamptz; current_time_value timestamptz;
BEGIN
 zone:=salon_lock_calendar(p_calendar);
 SELECT * INTO practitioner FROM salon_practitioners WHERE id=p_practitioner AND calendar_id=p_calendar FOR UPDATE;
 SELECT * INTO service FROM salon_services WHERE id=p_service AND calendar_id=p_calendar;
 SELECT * INTO rules FROM salon_settings WHERE calendar_id=p_calendar;
 IF practitioner.id IS NULL OR NOT practitioner.active OR practitioner.user_id IS NULL
  OR NOT EXISTS (SELECT 1 FROM calendar_memberships WHERE calendar_id=p_calendar AND user_id=practitioner.user_id AND permission IN ('owner','editor'))
  OR service.id IS NULL OR NOT service.active
  OR NOT EXISTS (SELECT 1 FROM salon_practitioner_services WHERE calendar_id=p_calendar AND practitioner_id=p_practitioner AND service_id=p_service AND active)
  OR rules.calendar_id IS NULL THEN
  RAISE EXCEPTION 'This practitioner or service is unavailable.' USING ERRCODE='23514',CONSTRAINT='salon_eligibility';
 END IF;
 IF p_public AND (NOT rules.public_enabled OR NOT practitioner.bookable OR NOT service.bookable) THEN
  RAISE EXCEPTION 'Online booking is unavailable.' USING ERRCODE='23514',CONSTRAINT='salon_public';
 END IF;
 current_time_value:=clock_timestamp();
 IF p_start IS NULL OR NOT isfinite(p_start) OR p_start<=current_time_value
  OR p_start<current_time_value+rules.lead_minutes*interval '1 minute'
  OR p_start>current_time_value+rules.advance_days*interval '24 hours' THEN
  RAISE EXCEPTION 'Choose a time within the booking window.' USING ERRCODE='23514',CONSTRAINT='salon_booking_window';
 END IF;
 local_start:=p_start AT TIME ZONE zone;
 IF extract(second FROM local_start)<>0
  OR (extract(hour FROM local_start)::integer*60+extract(minute FROM local_start)::integer)%rules.slot_minutes<>0 THEN
  RAISE EXCEPTION 'Choose an available booking time.' USING ERRCODE='23514',CONSTRAINT='salon_slot';
 END IF;
 busy_start:=p_start-p_before*interval '1 minute';
 busy_end:=p_start+(p_duration+p_after)*interval '1 minute';
 -- Check every real minute, including both autumn folds. Endpoint-only checks
 -- can bridge a local closure during a clock change. Adjacent hour ranges may
 -- form one continuous open interval, matching the public slot engine.
 IF EXISTS (SELECT 1 FROM generate_series(busy_start,busy_end-interval '1 minute',interval '1 minute') tick(instant)
  WHERE NOT EXISTS (SELECT 1 FROM salon_working_hours h WHERE h.calendar_id=p_calendar AND h.practitioner_id=p_practitioner
   AND h.active AND h.weekday=extract(dow FROM tick.instant AT TIME ZONE zone)::integer
   AND h.start_minute<=extract(hour FROM tick.instant AT TIME ZONE zone)::integer*60+extract(minute FROM tick.instant AT TIME ZONE zone)::integer
   AND h.end_minute>extract(hour FROM tick.instant AT TIME ZONE zone)::integer*60+extract(minute FROM tick.instant AT TIME ZONE zone)::integer)) THEN
  RAISE EXCEPTION 'The full visit and its buffers must fit working hours.' USING ERRCODE='23514',CONSTRAINT='salon_hours';
 END IF;
 IF EXISTS (SELECT 1 FROM salon_time_blocks b WHERE b.calendar_id=p_calendar AND b.practitioner_id=p_practitioner
   AND b.active AND b.start_at<busy_end AND busy_start<b.end_at)
  OR EXISTS (SELECT 1 FROM salon_appointments a WHERE a.calendar_id=p_calendar AND a.practitioner_id=p_practitioner
   AND a.status='confirmed' AND (p_exclude IS NULL OR a.id<>p_exclude)
   AND a.busy_start_at<busy_end AND busy_start<a.busy_end_at) THEN
  RAISE EXCEPTION 'This time is no longer available. Choose another time.' USING ERRCODE='23514',CONSTRAINT='salon_overlap';
 END IF;
END; $$;

-- Keep the critical booking boundary at the table too: existing application
-- CRUD privileges must not provide a path around reservation/ownership checks.
CREATE FUNCTION salon_validate_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_role text; practitioner salon_practitioners%ROWTYPE; service salon_services%ROWTYPE;
 rules salon_settings%ROWTYPE; is_staff boolean; public_booking boolean;
BEGIN
 PERFORM salon_lock_calendar(NEW.calendar_id);
 SELECT * INTO practitioner FROM salon_practitioners WHERE id=NEW.practitioner_id AND calendar_id=NEW.calendar_id FOR UPDATE;
 actor_role:=salon_actor_role(NEW.calendar_id,NEW.updated_by_user_id);
 is_staff:=COALESCE(actor_role IN ('owner','manager') OR
  (actor_role='practitioner' AND practitioner.user_id=NEW.updated_by_user_id),false);
 IF TG_OP='INSERT' THEN
  public_booking:=NEW.client_user_id IS NOT NULL;
  IF NEW.updated_by_user_id IS DISTINCT FROM NEW.created_by_user_id
   OR (public_booking AND (NEW.client_user_id IS DISTINCT FROM NEW.created_by_user_id OR NEW.notes<>''))
   OR (NOT public_booking AND NOT is_staff) OR NEW.status<>'confirmed' OR NEW.version<>1 THEN
   RAISE EXCEPTION 'You cannot create this appointment.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  SELECT * INTO service FROM salon_services WHERE id=NEW.service_id AND calendar_id=NEW.calendar_id;
  SELECT * INTO rules FROM salon_settings WHERE calendar_id=NEW.calendar_id;
  IF service.id IS NULL OR rules.calendar_id IS NULL OR ROW(NEW.service_name,NEW.duration_minutes,
    NEW.buffer_before_minutes,NEW.buffer_after_minutes,NEW.price_minor,NEW.currency,NEW.cancellation_hours)
   IS DISTINCT FROM ROW(service.name,service.duration_minutes,service.buffer_before_minutes,
    service.buffer_after_minutes,service.price_minor,service.currency,rules.cancellation_hours) THEN
   RAISE EXCEPTION 'Use the current service and booking terms.' USING ERRCODE='23514',CONSTRAINT='salon_snapshot';
  END IF;
  IF NEW.request_payload->'expectedTerms' IS DISTINCT FROM jsonb_build_object('serviceName',service.name,
   'durationMinutes',service.duration_minutes,'priceMinor',service.price_minor,
   'currency',service.currency,'cancellationHours',rules.cancellation_hours) THEN
   RAISE EXCEPTION 'The service or booking terms changed. Refresh and review them before booking.' USING ERRCODE='23514',CONSTRAINT='salon_terms';
  END IF;
  PERFORM salon_check_slot(NEW.calendar_id,NEW.practitioner_id,NEW.service_id,NEW.start_at,
   NEW.duration_minutes,NEW.buffer_before_minutes,NEW.buffer_after_minutes,public_booking);
 ELSE
  IF NOT is_staff AND OLD.client_user_id IS DISTINCT FROM NEW.updated_by_user_id THEN
   RAISE EXCEPTION 'You cannot manage this appointment.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  IF OLD.status<>'confirmed' OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'This appointment changed. Reload before trying again.' USING ERRCODE='23514',CONSTRAINT='salon_revision';
  END IF;
  IF OLD.end_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'This appointment has ended.' USING ERRCODE='23514',CONSTRAINT='salon_ended';
  END IF;
  IF NOT is_staff AND OLD.start_at<=clock_timestamp()+OLD.cancellation_hours*interval '1 hour' THEN
   RAISE EXCEPTION 'The change deadline has passed. Contact the business.' USING ERRCODE='23514',CONSTRAINT='salon_cancellation';
  END IF;
  IF NEW.status='cancelled' THEN
   IF ROW(NEW.start_at,NEW.end_at,NEW.busy_start_at,NEW.busy_end_at)
    IS DISTINCT FROM ROW(OLD.start_at,OLD.end_at,OLD.busy_start_at,OLD.busy_end_at) THEN
    RAISE EXCEPTION 'Cancellation cannot move an appointment.' USING ERRCODE='23514',CONSTRAINT='salon_snapshot';
   END IF;
  ELSE
   PERFORM salon_check_slot(NEW.calendar_id,NEW.practitioner_id,NEW.service_id,NEW.start_at,
    OLD.duration_minutes,OLD.buffer_before_minutes,OLD.buffer_after_minutes,false,OLD.id);
  END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END; $$;
CREATE TRIGGER salon_appointment_authority_guard BEFORE INSERT OR UPDATE ON salon_appointments
 FOR EACH ROW EXECUTE FUNCTION salon_validate_appointment();

CREATE FUNCTION salon_validate_time_block() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_role text; practitioner salon_practitioners%ROWTYPE;
BEGIN
 PERFORM salon_lock_calendar(NEW.calendar_id);
 SELECT * INTO practitioner FROM salon_practitioners WHERE id=NEW.practitioner_id AND calendar_id=NEW.calendar_id FOR UPDATE;
 actor_role:=salon_actor_role(NEW.calendar_id,NEW.updated_by_user_id);
 IF practitioner.id IS NULL OR actor_role IS NULL OR (actor_role='practitioner' AND practitioner.user_id IS DISTINCT FROM NEW.updated_by_user_id)
  OR (TG_OP='INSERT' AND NEW.created_by_user_id IS DISTINCT FROM NEW.updated_by_user_id) THEN
  RAISE EXCEPTION 'You cannot change this practitioner availability.' USING ERRCODE='23514',CONSTRAINT='salon_access';
 END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.calendar_id,NEW.practitioner_id,NEW.created_by_user_id,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.calendar_id,OLD.practitioner_id,OLD.created_by_user_id,OLD.created_at) THEN
  RAISE EXCEPTION 'Time blocks cannot change calendar or practitioner.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
 END IF;
 IF NEW.active AND EXISTS (SELECT 1 FROM salon_appointments a WHERE a.calendar_id=NEW.calendar_id
  AND a.practitioner_id=NEW.practitioner_id AND a.status='confirmed'
  AND a.busy_start_at<NEW.end_at AND NEW.start_at<a.busy_end_at) THEN
  RAISE EXCEPTION 'This time off overlaps an appointment. Move or cancel that appointment first.' USING ERRCODE='23514',CONSTRAINT='salon_overlap';
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END; $$;
CREATE TRIGGER salon_time_block_authority_guard BEFORE INSERT OR UPDATE ON salon_time_blocks
 FOR EACH ROW EXECUTE FUNCTION salon_validate_time_block();

CREATE FUNCTION salon_preserve_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.calendar_id,NEW.practitioner_id,NEW.service_id,NEW.client_user_id,NEW.created_by_user_id,
    NEW.request_key,NEW.request_payload,NEW.client_name,NEW.client_email,NEW.client_phone,NEW.notes,NEW.service_name,
    NEW.duration_minutes,NEW.buffer_before_minutes,NEW.buffer_after_minutes,NEW.price_minor,NEW.currency,NEW.cancellation_hours,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.calendar_id,OLD.practitioner_id,OLD.service_id,OLD.client_user_id,OLD.created_by_user_id,
    OLD.request_key,OLD.request_payload,OLD.client_name,OLD.client_email,OLD.client_phone,OLD.notes,OLD.service_name,
    OLD.duration_minutes,OLD.buffer_before_minutes,OLD.buffer_after_minutes,OLD.price_minor,OLD.currency,OLD.cancellation_hours,OLD.created_at) THEN
   RAISE EXCEPTION 'Appointment identity and booked terms cannot change.' USING ERRCODE='23514',CONSTRAINT='salon_snapshot';
  END IF;
  IF OLD.status<>'confirmed' OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'This appointment changed. Reload before trying again.' USING ERRCODE='23514',CONSTRAINT='salon_revision';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER salon_appointment_snapshot_guard BEFORE UPDATE ON salon_appointments FOR EACH ROW EXECUTE FUNCTION salon_preserve_appointment();
CREATE FUNCTION salon_record_appointment_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO salon_updates(calendar_id,appointment_id,user_id,action,version,previous_start_at,start_at)
 VALUES(NEW.calendar_id,NEW.id,NEW.updated_by_user_id,
  CASE WHEN TG_OP='INSERT' THEN 'created' WHEN NEW.status='cancelled' THEN 'cancelled' ELSE 'rescheduled' END,
  NEW.version,CASE WHEN TG_OP='UPDATE' THEN OLD.start_at ELSE NULL END,NEW.start_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER salon_appointment_update AFTER INSERT OR UPDATE ON salon_appointments FOR EACH ROW EXECUTE FUNCTION salon_record_appointment_update();

CREATE FUNCTION salon_book(p_calendar uuid,p_actor uuid,p_data jsonb,p_public_booking boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor_role text; practitioner salon_practitioners%ROWTYPE; service salon_services%ROWTYPE;
 rules salon_settings%ROWTYPE; existing salon_appointments%ROWTYPE; result salon_appointments%ROWTYPE;
 booking_start timestamptz; payload jsonb; client_account uuid; request_id uuid;
BEGIN
 PERFORM salon_lock_calendar(p_calendar);
 IF p_actor IS NULL OR p_public_booking IS NULL THEN
  RAISE EXCEPTION 'Sign in to book an appointment.' USING ERRCODE='23514',CONSTRAINT='salon_access';
 END IF;
 actor_role:=salon_actor_role(p_calendar,p_actor);
 SELECT * INTO practitioner FROM salon_practitioners WHERE id=(p_data->>'practitionerId')::uuid AND calendar_id=p_calendar FOR UPDATE;
 IF NOT p_public_booking AND (actor_role IS NULL OR (actor_role='practitioner' AND practitioner.user_id IS DISTINCT FROM p_actor)) THEN
  RAISE EXCEPTION 'You cannot book for this practitioner.' USING ERRCODE='23514',CONSTRAINT='salon_access';
 END IF;
 IF NOT p_public_booking THEN
  INSERT INTO salon_settings(calendar_id,business_name) SELECT id,left(name,120) FROM calendars WHERE id=p_calendar ON CONFLICT DO NOTHING;
 END IF;
 -- Client identity is exclusively the trusted actor argument. Manual staff
 -- bookings intentionally remain unlinked even if an email matches an account.
 client_account:=CASE WHEN p_public_booking THEN p_actor ELSE NULL END;
 booking_start:=(p_data->>'start')::timestamptz;
 request_id:=(p_data->>'requestId')::uuid;
 payload:=jsonb_build_object('practitionerId',practitioner.id,'serviceId',(p_data->>'serviceId')::uuid,
  'start',booking_start,'clientName',trim(p_data->>'clientName'),'clientEmail',COALESCE(p_data->>'clientEmail',''),
  'clientPhone',COALESCE(p_data->>'clientPhone',''),'notes',CASE WHEN p_public_booking THEN '' ELSE COALESCE(p_data->>'notes','') END,
  'publicBooking',p_public_booking,'expectedTerms',p_data->'expectedTerms');
 SELECT * INTO existing FROM salon_appointments WHERE calendar_id=p_calendar AND created_by_user_id=p_actor AND request_key=request_id;
 IF existing.id IS NOT NULL THEN
  IF existing.request_payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION 'This booking request was already used for different details.' USING ERRCODE='23514',CONSTRAINT='salon_idempotency';
  END IF;
  RETURN jsonb_build_object('ok',true,'id',existing.id,'version',existing.version,'status',existing.status);
 END IF;
 SELECT * INTO service FROM salon_services WHERE id=(p_data->>'serviceId')::uuid AND calendar_id=p_calendar;
 SELECT * INTO rules FROM salon_settings WHERE calendar_id=p_calendar;
 -- A reviewed confirmation is bound to its displayed terms. A retry of an
 -- already-created booking returned above remains valid after later menu edits.
 IF p_data->'expectedTerms' IS DISTINCT FROM jsonb_build_object('serviceName',service.name,
  'durationMinutes',service.duration_minutes,'priceMinor',service.price_minor,
  'currency',service.currency,'cancellationHours',rules.cancellation_hours) THEN
  RAISE EXCEPTION 'The service or booking terms changed. Refresh and review them before booking.' USING ERRCODE='23514',CONSTRAINT='salon_terms';
 END IF;
 PERFORM salon_check_slot(p_calendar,practitioner.id,service.id,booking_start,
  service.duration_minutes,service.buffer_before_minutes,service.buffer_after_minutes,p_public_booking);
 INSERT INTO salon_appointments(calendar_id,practitioner_id,service_id,client_user_id,created_by_user_id,updated_by_user_id,
  request_key,request_payload,client_name,client_email,client_phone,notes,service_name,duration_minutes,
  buffer_before_minutes,buffer_after_minutes,price_minor,currency,cancellation_hours,start_at,end_at,busy_start_at,busy_end_at)
 VALUES(p_calendar,practitioner.id,service.id,client_account,p_actor,p_actor,request_id,payload,payload->>'clientName',
  payload->>'clientEmail',payload->>'clientPhone',payload->>'notes',service.name,service.duration_minutes,
  service.buffer_before_minutes,service.buffer_after_minutes,service.price_minor,service.currency,rules.cancellation_hours,
  booking_start,booking_start+service.duration_minutes*interval '1 minute',
  booking_start-service.buffer_before_minutes*interval '1 minute',
  booking_start+(service.duration_minutes+service.buffer_after_minutes)*interval '1 minute') RETURNING * INTO result;
 RETURN jsonb_build_object('ok',true,'id',result.id,'version',result.version,'status',result.status);
END; $$;

CREATE FUNCTION salon_change_appointment(p_actor uuid,p_appointment uuid,p_expected_version integer,p_action text,
 p_start timestamptz DEFAULT NULL,p_staff_calendar uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE target_calendar uuid; appointment salon_appointments%ROWTYPE; actor_role text; practitioner salon_practitioners%ROWTYPE;
BEGIN
 SELECT calendar_id INTO target_calendar FROM salon_appointments WHERE id=p_appointment;
 IF target_calendar IS NULL OR (p_staff_calendar IS NOT NULL AND p_staff_calendar<>target_calendar) THEN
  RAISE EXCEPTION 'Appointment not found.' USING ERRCODE='23514',CONSTRAINT='salon_access';
 END IF;
 PERFORM salon_lock_calendar(target_calendar);
 SELECT * INTO appointment FROM salon_appointments WHERE id=p_appointment AND calendar_id=target_calendar FOR UPDATE;
 SELECT * INTO practitioner FROM salon_practitioners WHERE id=appointment.practitioner_id AND calendar_id=target_calendar FOR UPDATE;
 actor_role:=salon_actor_role(target_calendar,p_actor);
 IF p_actor IS NULL OR (p_staff_calendar IS NULL AND appointment.client_user_id IS DISTINCT FROM p_actor)
  OR (p_staff_calendar IS NOT NULL AND (actor_role IS NULL OR (actor_role='practitioner' AND practitioner.user_id IS DISTINCT FROM p_actor))) THEN
  RAISE EXCEPTION 'You cannot manage this appointment.' USING ERRCODE='23514',CONSTRAINT='salon_access';
 END IF;
 IF p_expected_version IS NULL OR appointment.version<>p_expected_version OR appointment.status<>'confirmed' THEN
  RAISE EXCEPTION 'This appointment changed. Reload before trying again.' USING ERRCODE='23514',CONSTRAINT='salon_revision';
 END IF;
 IF appointment.end_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'This appointment has ended.' USING ERRCODE='23514',CONSTRAINT='salon_ended';
 END IF;
 IF p_staff_calendar IS NULL AND appointment.start_at<=clock_timestamp()+appointment.cancellation_hours*interval '1 hour' THEN
  RAISE EXCEPTION 'The change deadline has passed. Contact the business.' USING ERRCODE='23514',CONSTRAINT='salon_cancellation';
 END IF;
 IF p_action='reschedule' THEN
  IF p_start=appointment.start_at THEN
   RETURN jsonb_build_object('ok',true,'id',appointment.id,'version',appointment.version,'status',appointment.status);
  END IF;
  PERFORM salon_check_slot(target_calendar,appointment.practitioner_id,appointment.service_id,p_start,
   appointment.duration_minutes,appointment.buffer_before_minutes,appointment.buffer_after_minutes,false,appointment.id);
  UPDATE salon_appointments SET start_at=p_start,end_at=p_start+duration_minutes*interval '1 minute',
   busy_start_at=p_start-buffer_before_minutes*interval '1 minute',
   busy_end_at=p_start+(duration_minutes+buffer_after_minutes)*interval '1 minute',
   version=version+1,updated_at=now(),updated_by_user_id=p_actor WHERE id=appointment.id RETURNING * INTO appointment;
 ELSIF p_action='cancel' THEN
  UPDATE salon_appointments SET status='cancelled',version=version+1,updated_at=now(),updated_by_user_id=p_actor
   WHERE id=appointment.id RETURNING * INTO appointment;
 ELSE
  RAISE EXCEPTION 'Unknown appointment action.' USING ERRCODE='23514',CONSTRAINT='salon_action';
 END IF;
 RETURN jsonb_build_object('ok',true,'id',appointment.id,'version',appointment.version,'status',appointment.status);
END; $$;

CREATE FUNCTION salon_mutate(p_calendar uuid,p_actor uuid,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor_role text; target_id uuid; practitioner salon_practitioners%ROWTYPE;
 rules salon_settings%ROWTYPE; invite calendar_invites%ROWTYPE; invite_role salon_invite_roles%ROWTYPE;
 entry jsonb; requested_role text; new_id uuid; requested_service uuid;
BEGIN
 PERFORM salon_lock_calendar(p_calendar);
 actor_role:=salon_actor_role(p_calendar,p_actor);
 IF p_actor IS NULL OR actor_role IS NULL THEN
  RAISE EXCEPTION 'Salon staff access is required.' USING ERRCODE='23514',CONSTRAINT='salon_access';
 END IF;
 INSERT INTO salon_settings(calendar_id,business_name) SELECT id,left(name,120) FROM calendars WHERE id=p_calendar ON CONFLICT DO NOTHING;
 IF p_action='book' THEN RETURN salon_book(p_calendar,p_actor,p_data,false); END IF;
 IF p_action IN ('reschedule','cancel') THEN
  RETURN salon_change_appointment(p_actor,(p_data->>'id')::uuid,(p_data->>'version')::integer,p_action,
   CASE WHEN p_action='reschedule' THEN (p_data->>'start')::timestamptz ELSE NULL END,p_calendar);
 END IF;
 IF p_action='addSelf' THEN
  IF actor_role<>'owner' THEN
   RAISE EXCEPTION 'Only the owner can add their own practitioner profile.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  SELECT id INTO target_id FROM salon_practitioners WHERE calendar_id=p_calendar AND user_id=p_actor FOR UPDATE;
  IF target_id IS NOT NULL THEN
   RAISE EXCEPTION 'Your practitioner profile already exists.' USING ERRCODE='23514',CONSTRAINT='salon_profile';
  END IF;
  INSERT INTO salon_practitioners(calendar_id,user_id,role,display_name,bio,kind)
   VALUES(p_calendar,p_actor,'owner',trim(p_data->>'displayName'),COALESCE(p_data->>'bio',''),COALESCE(p_data->>'kind','staff'))
   RETURNING id INTO target_id;
  RETURN jsonb_build_object('ok',true,'id',target_id);
 END IF;
 IF p_action IN ('saveHours','saveTimeBlock') THEN
  SELECT * INTO practitioner FROM salon_practitioners WHERE id=(p_data->>'practitionerId')::uuid AND calendar_id=p_calendar FOR UPDATE;
  IF practitioner.id IS NULL OR (actor_role='practitioner' AND practitioner.user_id IS DISTINCT FROM p_actor) THEN
   RAISE EXCEPTION 'You can only change your own availability.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  IF p_action='saveHours' THEN
   IF jsonb_typeof(p_data->'hours') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'hours')>28 THEN
    RAISE EXCEPTION 'Choose valid working hours.' USING ERRCODE='23514',CONSTRAINT='salon_hours';
   END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'hours') WITH ORDINALITY a(value,n)
    JOIN jsonb_array_elements(p_data->'hours') WITH ORDINALITY b(value,n) ON a.n<b.n
    WHERE (a.value->>'weekday')::integer=(b.value->>'weekday')::integer
     AND (a.value->>'startMinute')::integer<(b.value->>'endMinute')::integer
     AND (b.value->>'startMinute')::integer<(a.value->>'endMinute')::integer) THEN
    RAISE EXCEPTION 'Working hours must not overlap.' USING ERRCODE='23514',CONSTRAINT='salon_hours';
   END IF;
   UPDATE salon_working_hours SET active=false WHERE calendar_id=p_calendar AND practitioner_id=practitioner.id AND active;
   FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'hours') LOOP
    INSERT INTO salon_working_hours(calendar_id,practitioner_id,weekday,start_minute,end_minute,active)
     VALUES(p_calendar,practitioner.id,(entry->>'weekday')::integer,(entry->>'startMinute')::integer,(entry->>'endMinute')::integer,true)
     ON CONFLICT (practitioner_id,weekday,start_minute,end_minute) DO UPDATE SET active=true;
   END LOOP;
   RETURN jsonb_build_object('ok',true,'id',practitioner.id);
  END IF;
  target_id:=NULLIF(p_data->>'id','')::uuid;
  IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM salon_time_blocks WHERE id=target_id AND calendar_id=p_calendar AND practitioner_id=practitioner.id) THEN
   RAISE EXCEPTION 'Time block not found.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
  END IF;
  IF COALESCE((p_data->>'active')::boolean,true) AND EXISTS (SELECT 1 FROM salon_appointments a
    WHERE a.calendar_id=p_calendar AND a.practitioner_id=practitioner.id AND a.status='confirmed'
     AND a.busy_start_at<(p_data->>'end')::timestamptz AND (p_data->>'start')::timestamptz<a.busy_end_at) THEN
   RAISE EXCEPTION 'This time off overlaps an appointment. Move or cancel that appointment first.' USING ERRCODE='23514',CONSTRAINT='salon_overlap';
  END IF;
  IF target_id IS NULL THEN
   INSERT INTO salon_time_blocks(calendar_id,practitioner_id,start_at,end_at,reason,active,created_by_user_id,updated_by_user_id)
    VALUES(p_calendar,practitioner.id,(p_data->>'start')::timestamptz,(p_data->>'end')::timestamptz,
     COALESCE(p_data->>'reason',''),COALESCE((p_data->>'active')::boolean,true),p_actor,p_actor) RETURNING id INTO target_id;
  ELSE
   UPDATE salon_time_blocks SET start_at=(p_data->>'start')::timestamptz,end_at=(p_data->>'end')::timestamptz,
    reason=COALESCE(p_data->>'reason',''),active=COALESCE((p_data->>'active')::boolean,true),updated_by_user_id=p_actor,updated_at=now()
    WHERE id=target_id AND calendar_id=p_calendar;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',target_id);
 END IF;
 IF actor_role NOT IN ('owner','manager') AND p_action<>'savePractitioner' THEN
  RAISE EXCEPTION 'A Salon organiser must make this change.' USING ERRCODE='23514',CONSTRAINT='salon_access';
 END IF;
 IF p_action='saveSettings' THEN
  IF actor_role<>'owner' THEN
   RAISE EXCEPTION 'Only the owner can change booking settings.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  SELECT * INTO rules FROM salon_settings WHERE calendar_id=p_calendar;
  IF actor_role<>'owner' AND (p_data->>'publicEnabled')::boolean IS DISTINCT FROM COALESCE(rules.public_enabled,false) THEN
   RAISE EXCEPTION 'Only the owner can change public booking.' USING ERRCODE='23514',CONSTRAINT='salon_public';
  END IF;
  IF length(trim(p_data->>'businessName'))=0 THEN
   RAISE EXCEPTION 'Enter a business name.' USING ERRCODE='23514',CONSTRAINT='salon_settings';
  END IF;
  INSERT INTO salon_settings(calendar_id,business_name,description,location,public_enabled,lead_minutes,advance_days,slot_minutes,cancellation_hours)
   VALUES(p_calendar,trim(p_data->>'businessName'),COALESCE(p_data->>'description',''),COALESCE(p_data->>'location',''),
    (p_data->>'publicEnabled')::boolean,(p_data->>'leadMinutes')::integer,(p_data->>'advanceDays')::integer,
    (p_data->>'slotMinutes')::integer,(p_data->>'cancellationHours')::integer)
   ON CONFLICT (calendar_id) DO UPDATE SET business_name=EXCLUDED.business_name,description=EXCLUDED.description,
    location=EXCLUDED.location,public_enabled=EXCLUDED.public_enabled,lead_minutes=EXCLUDED.lead_minutes,
    advance_days=EXCLUDED.advance_days,slot_minutes=EXCLUDED.slot_minutes,cancellation_hours=EXCLUDED.cancellation_hours,updated_at=now();
  RETURN jsonb_build_object('ok',true,'id',p_calendar);
 ELSIF p_action='saveService' THEN
  target_id:=NULLIF(p_data->>'id','')::uuid;
  IF target_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM salon_services WHERE id=target_id AND calendar_id=p_calendar) THEN
   RAISE EXCEPTION 'Service not found.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
  END IF;
  new_id:=COALESCE(target_id,gen_random_uuid());
  INSERT INTO salon_services(id,calendar_id,name,description,duration_minutes,buffer_before_minutes,buffer_after_minutes,price_minor,currency,active,bookable)
   VALUES(new_id,p_calendar,trim(p_data->>'name'),COALESCE(p_data->>'description',''),(p_data->>'durationMinutes')::integer,
    (p_data->>'bufferBeforeMinutes')::integer,(p_data->>'bufferAfterMinutes')::integer,(p_data->>'priceMinor')::integer,
    COALESCE(p_data->>'currency','NZD'),COALESCE((p_data->>'active')::boolean,true),COALESCE((p_data->>'bookable')::boolean,false))
   ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,duration_minutes=EXCLUDED.duration_minutes,
    buffer_before_minutes=EXCLUDED.buffer_before_minutes,buffer_after_minutes=EXCLUDED.buffer_after_minutes,price_minor=EXCLUDED.price_minor,
    currency=EXCLUDED.currency,active=EXCLUDED.active,bookable=EXCLUDED.bookable,updated_at=now();
  RETURN jsonb_build_object('ok',true,'id',new_id);
 ELSIF p_action='savePractitioner' THEN
  SELECT * INTO practitioner FROM salon_practitioners WHERE id=(p_data->>'id')::uuid AND calendar_id=p_calendar FOR UPDATE;
  IF practitioner.id IS NULL THEN
   RAISE EXCEPTION 'Practitioner not found.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
  END IF;
  requested_role:=p_data->>'role';
  IF actor_role='practitioner' AND practitioner.user_id IS DISTINCT FROM p_actor THEN
   RAISE EXCEPTION 'You can only edit your own profile.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  IF actor_role<>'owner' AND practitioner.user_id=p_actor THEN
   IF requested_role IS DISTINCT FROM practitioner.role
    OR (p_data->>'active')::boolean IS DISTINCT FROM practitioner.active
    OR (p_data->>'bookable')::boolean IS DISTINCT FROM practitioner.bookable THEN
    RAISE EXCEPTION 'Only the owner can change your role, activation or publication.' USING ERRCODE='23514',CONSTRAINT='salon_access';
   END IF;
  ELSIF actor_role<>'owner' AND (practitioner.role IN ('owner','manager') OR requested_role<>'practitioner'
    OR (p_data->>'bookable')::boolean IS DISTINCT FROM practitioner.bookable) THEN
   RAISE EXCEPTION 'Only the owner can change manager authority or practitioner publication.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  IF (requested_role='owner') IS DISTINCT FROM EXISTS (SELECT 1 FROM calendar_memberships
    WHERE calendar_id=p_calendar AND user_id=practitioner.user_id AND permission='owner') THEN
   RAISE EXCEPTION 'Calendar ownership cannot be changed here.' USING ERRCODE='23514',CONSTRAINT='salon_access';
  END IF;
  UPDATE salon_practitioners SET display_name=trim(p_data->>'displayName'),bio=COALESCE(p_data->>'bio',''),
   kind=COALESCE(p_data->>'kind','staff'),role=requested_role,active=(p_data->>'active')::boolean,
   bookable=(p_data->>'bookable')::boolean,updated_at=now() WHERE id=practitioner.id AND calendar_id=p_calendar;
  RETURN jsonb_build_object('ok',true,'id',practitioner.id);
 ELSIF p_action='saveEligibility' THEN
  SELECT * INTO practitioner FROM salon_practitioners WHERE id=(p_data->>'practitionerId')::uuid AND calendar_id=p_calendar FOR UPDATE;
  IF practitioner.id IS NULL OR jsonb_typeof(p_data->'serviceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'serviceIds')>100 THEN
   RAISE EXCEPTION 'Choose this practitioner and their services.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_data->'serviceIds') s(id)
    WHERE NOT EXISTS (SELECT 1 FROM salon_services WHERE calendar_id=p_calendar AND id=s.id::uuid)) THEN
   RAISE EXCEPTION 'Choose services from this Salon.' USING ERRCODE='23514',CONSTRAINT='salon_scope';
  END IF;
  UPDATE salon_practitioner_services SET active=false WHERE calendar_id=p_calendar AND practitioner_id=practitioner.id AND active;
  FOR requested_service IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p_data->'serviceIds') LOOP
   INSERT INTO salon_practitioner_services(calendar_id,practitioner_id,service_id,active)
    VALUES(p_calendar,practitioner.id,requested_service,true)
    ON CONFLICT (practitioner_id,service_id) DO UPDATE SET active=true;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'id',practitioner.id);
 ELSIF p_action='createInvite' THEN
  requested_role:=p_data->>'role';
  IF requested_role IS NULL OR requested_role NOT IN ('manager','practitioner') OR (requested_role='manager' AND actor_role<>'owner') THEN
   RAISE EXCEPTION 'Only the owner can invite managers.' USING ERRCODE='23514',CONSTRAINT='salon_invite_access';
  END IF;
  IF (p_data->>'codeHash') IS NULL OR (p_data->>'codeHash') !~ '^[a-f0-9]{64}$'
   OR (p_data->>'expiresAt') IS NULL OR (p_data->>'expiresAt')::timestamptz<=clock_timestamp()
   OR (p_data->>'expiresAt')::timestamptz>clock_timestamp()+interval '30 days' THEN
   RAISE EXCEPTION 'Choose a valid invitation expiry.' USING ERRCODE='23514',CONSTRAINT='salon_invite';
  END IF;
  INSERT INTO calendar_invites(calendar_id,code_hash,code_hint,permission,created_by_user_id,max_uses,expires_at)
   VALUES(p_calendar,p_data->>'codeHash',p_data->>'codeHint','editor',p_actor,1,(p_data->>'expiresAt')::timestamptz)
   RETURNING * INTO invite;
  INSERT INTO salon_invite_roles(invite_id,calendar_id,role,display_name,kind)
   VALUES(invite.id,p_calendar,requested_role,trim(p_data->>'displayName'),COALESCE(p_data->>'kind','staff'));
  RETURN jsonb_build_object('ok',true,'id',invite.id,'expiresAt',invite.expires_at);
 ELSIF p_action='revokeInvite' THEN
  SELECT * INTO invite FROM calendar_invites WHERE id=(p_data->>'id')::uuid AND calendar_id=p_calendar FOR UPDATE;
  SELECT * INTO invite_role FROM salon_invite_roles WHERE invite_id=invite.id AND calendar_id=p_calendar FOR UPDATE;
  IF invite.id IS NULL OR invite_role.invite_id IS NULL OR (actor_role<>'owner' AND (invite_role.role='manager' OR invite.created_by_user_id<>p_actor)) THEN
   RAISE EXCEPTION 'You cannot revoke this invitation.' USING ERRCODE='23514',CONSTRAINT='salon_invite_access';
  END IF;
  UPDATE calendar_invites SET revoked_at=COALESCE(revoked_at,now()) WHERE id=invite.id;
  RETURN jsonb_build_object('ok',true,'id',invite.id);
 END IF;
 RAISE EXCEPTION 'Unknown Salon action.' USING ERRCODE='23514',CONSTRAINT='salon_action';
END; $$;

CREATE FUNCTION salon_redeem_invitation(p_code_hash text,p_actor uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE target_calendar uuid; invite calendar_invites%ROWTYPE; invited_role salon_invite_roles%ROWTYPE;
 inviter_role text; existing_profile salon_practitioners%ROWTYPE; existing_permission calendar_permission;
BEGIN
 SELECT i.calendar_id INTO target_calendar FROM calendar_invites i JOIN salon_invite_roles r
  ON r.invite_id=i.id AND r.calendar_id=i.calendar_id WHERE i.code_hash=p_code_hash;
 IF target_calendar IS NULL OR p_actor IS NULL THEN
  RAISE EXCEPTION 'This invitation is unavailable.' USING ERRCODE='23514',CONSTRAINT='salon_invite_access';
 END IF;
 PERFORM salon_lock_calendar(target_calendar);
 SELECT * INTO invite FROM calendar_invites WHERE code_hash=p_code_hash AND calendar_id=target_calendar FOR UPDATE;
 SELECT * INTO invited_role FROM salon_invite_roles WHERE invite_id=invite.id AND calendar_id=target_calendar FOR UPDATE;
 inviter_role:=salon_actor_role(target_calendar,invite.created_by_user_id);
 IF invite.id IS NULL OR invited_role.invite_id IS NULL OR invite.revoked_at IS NOT NULL
  OR invite.expires_at<=clock_timestamp() OR invite.use_count>=invite.max_uses
  OR invite.permission<>'editor' OR invite.max_uses<>1
  OR inviter_role IS NULL OR inviter_role NOT IN ('owner','manager')
  OR (invited_role.role='manager' AND inviter_role<>'owner') THEN
  RAISE EXCEPTION 'This invitation is unavailable. Ask the business for a new invitation.' USING ERRCODE='23514',CONSTRAINT='salon_invite_access';
 END IF;
 SELECT permission INTO existing_permission FROM calendar_memberships WHERE calendar_id=target_calendar AND user_id=p_actor;
 SELECT * INTO existing_profile FROM salon_practitioners WHERE calendar_id=target_calendar AND user_id=p_actor FOR UPDATE;
 IF existing_permission='owner' OR (existing_profile.id IS NOT NULL AND existing_profile.active) THEN
  RAISE EXCEPTION 'You already belong to this Salon team.' USING ERRCODE='23514',CONSTRAINT='salon_invite_member';
 END IF;
 -- Only Core membership and the explicit Salon role are involved; no parenting
 -- profile, participant, publication flag or unrelated calendar is touched.
 INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES(target_calendar,p_actor,'editor')
  ON CONFLICT (calendar_id,user_id) DO UPDATE SET permission='editor',updated_at=now()
  WHERE calendar_memberships.permission<>'owner';
 INSERT INTO salon_practitioners(calendar_id,user_id,role,display_name,kind,active,bookable)
  VALUES(target_calendar,p_actor,invited_role.role,invited_role.display_name,invited_role.kind,true,false)
  ON CONFLICT (calendar_id,user_id) DO UPDATE SET role=EXCLUDED.role,display_name=EXCLUDED.display_name,
   kind=EXCLUDED.kind,active=true,bookable=false,updated_at=now();
 UPDATE calendar_invites SET use_count=use_count+1,redeemed_by_user_id=p_actor,redeemed_at=now() WHERE id=invite.id;
 RETURN target_calendar;
END; $$;

-- Existing neondb_owner default table privileges provide covie_app CRUD.
-- All functions keep PostgreSQL's SECURITY INVOKER default: there are no new
-- role grants, credentials, definer functions or persistent external access.
INSERT INTO covie_schema_migrations(migration_id,description,baseline)
 VALUES('0035','Salon services, practitioners, appointments and typed invitations',false);
