-- Additive Social Groups domain. Apply only after isolated qualification and
-- explicit production migration approval. Requires 0033 template roles.
CREATE TABLE social_settings (
 calendar_id uuid PRIMARY KEY REFERENCES calendars(id) ON DELETE CASCADE,
 members_can_create boolean NOT NULL DEFAULT true
);
CREATE TABLE social_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 created_by_user_id uuid NOT NULL,
 updated_by_user_id uuid NOT NULL,
 request_key uuid NOT NULL DEFAULT gen_random_uuid(),
 title varchar(120) NOT NULL CHECK(length(trim(title))>0),
 location varchar(200) NOT NULL DEFAULT '', notes varchar(3000) NOT NULL DEFAULT '',
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
 capacity integer CHECK(capacity BETWEEN 1 AND 10000),
 cancelled boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,calendar_id), UNIQUE(calendar_id,created_by_user_id,request_key),
 CONSTRAINT social_event_time_valid CHECK(end_at>start_at)
);
CREATE INDEX social_events_calendar_time_idx ON social_events(calendar_id,start_at);
CREATE TABLE social_rsvps (
 calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,user_id uuid NOT NULL,
 response varchar(16) NOT NULL CHECK(response IN ('going','maybe','declined')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,user_id),
 FOREIGN KEY(event_id,calendar_id) REFERENCES social_events(id,calendar_id) ON DELETE CASCADE
);
CREATE TABLE social_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, date date NOT NULL,
 status varchar(16) NOT NULL CHECK(status IN ('available','unavailable')),
 note varchar(300) NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(calendar_id,user_id,date)
);
CREATE TABLE social_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
 event_id uuid NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
 action varchar(40) NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX social_updates_calendar_created_idx ON social_updates(calendar_id,created_at);
CREATE FUNCTION social_validate_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE permission calendar_permission; admin boolean; members_can_create boolean;
BEGIN
 SELECT m.permission, (m.permission='owner' OR r.role='admin') INTO permission,admin
 FROM calendar_memberships m JOIN calendars c ON c.id=m.calendar_id
 LEFT JOIN template_member_roles r ON r.calendar_id=m.calendar_id AND r.user_id=m.user_id
 WHERE m.calendar_id=NEW.calendar_id AND m.user_id=NEW.updated_by_user_id AND c.calendar_type='social_groups' AND c.archived_at IS NULL;
 IF permission IS NULL OR permission='viewer' THEN RAISE EXCEPTION 'Member access is required.' USING ERRCODE='23514',CONSTRAINT='social_event_access'; END IF;
 admin:=COALESCE(admin,false);
 IF TG_OP='INSERT' THEN
  SELECT COALESCE((SELECT s.members_can_create FROM social_settings s WHERE s.calendar_id=NEW.calendar_id),true) INTO members_can_create;
  IF NEW.created_by_user_id<>NEW.updated_by_user_id OR (NOT admin AND NOT members_can_create) THEN RAISE EXCEPTION 'Ask a group organiser to create this event.' USING ERRCODE='23514',CONSTRAINT='social_event_access'; END IF;
 ELSE
  IF NEW.calendar_id<>OLD.calendar_id OR NEW.created_by_user_id<>OLD.created_by_user_id OR (NOT admin AND NEW.updated_by_user_id<>OLD.created_by_user_id) THEN RAISE EXCEPTION 'Only the creator or organiser can change this event.' USING ERRCODE='23514',CONSTRAINT='social_event_access'; END IF;
  IF OLD.cancelled THEN RAISE EXCEPTION 'This event has been cancelled. Create another event.' USING ERRCODE='23514',CONSTRAINT='social_event_rules'; END IF;
  NEW.version:=OLD.version+1;NEW.updated_at:=now();
 END IF;
 IF NOT NEW.cancelled AND (TG_OP='INSERT' OR NEW.start_at<>OLD.start_at) AND NEW.start_at<=now() THEN RAISE EXCEPTION 'Choose a future event time.' USING ERRCODE='23514',CONSTRAINT='social_event_rules'; END IF;
 IF NEW.capacity IS NOT NULL AND NEW.capacity<(SELECT count(*) FROM social_rsvps WHERE event_id=NEW.id AND response='going') THEN RAISE EXCEPTION 'Capacity cannot be below the number already going.' USING ERRCODE='23514',CONSTRAINT='social_event_capacity'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER social_event_guard BEFORE INSERT OR UPDATE ON social_events FOR EACH ROW EXECUTE FUNCTION social_validate_event();
CREATE FUNCTION social_validate_rsvp() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event social_events%ROWTYPE; permission calendar_permission;
BEGIN
 SELECT * INTO event FROM social_events WHERE id=NEW.event_id AND calendar_id=NEW.calendar_id FOR UPDATE;
 SELECT m.permission INTO permission FROM calendar_memberships m JOIN calendars c ON c.id=m.calendar_id
 WHERE m.calendar_id=NEW.calendar_id AND m.user_id=NEW.user_id AND c.calendar_type='social_groups' AND c.archived_at IS NULL;
 IF permission IS NULL OR permission='viewer' OR event.id IS NULL OR event.cancelled OR event.end_at<=now() THEN RAISE EXCEPTION 'You cannot respond to this event. Reload the calendar.' USING ERRCODE='23514',CONSTRAINT='social_rsvp_access'; END IF;
 IF TG_OP='UPDATE' AND (NEW.event_id<>OLD.event_id OR NEW.calendar_id<>OLD.calendar_id OR NEW.user_id<>OLD.user_id) THEN RAISE EXCEPTION 'A response cannot change event or member.' USING ERRCODE='23514',CONSTRAINT='social_rsvp_access'; END IF;
 IF NEW.response='going' AND event.capacity IS NOT NULL AND (SELECT count(*) FROM social_rsvps WHERE event_id=NEW.event_id AND user_id<>NEW.user_id AND response='going')>=event.capacity THEN RAISE EXCEPTION 'This event is full. Choose Maybe or contact the organiser.' USING ERRCODE='23514',CONSTRAINT='social_rsvp_capacity'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END; $$;
CREATE TRIGGER social_rsvp_guard BEFORE INSERT OR UPDATE ON social_rsvps FOR EACH ROW EXECUTE FUNCTION social_validate_rsvp();
CREATE FUNCTION social_record_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO social_updates(calendar_id,event_id,action) VALUES(NEW.calendar_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'created' WHEN NEW.cancelled THEN 'cancelled' ELSE 'updated' END);
 RETURN NEW;
END; $$;
CREATE TRIGGER social_event_update AFTER INSERT OR UPDATE ON social_events FOR EACH ROW EXECUTE FUNCTION social_record_event_update();
INSERT INTO covie_schema_migrations(migration_id,description,baseline) VALUES('0034','Social Groups events, RSVPs and availability',false);
