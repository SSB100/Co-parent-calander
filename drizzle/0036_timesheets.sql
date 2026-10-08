-- Standalone Timesheets. Additive only; never migrate Staff attendance records.
-- Production execution requires separate reviewed migration approval.
ALTER TYPE calendar_type ADD VALUE IF NOT EXISTS 'timesheets';

CREATE TABLE organisations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_id uuid NOT NULL UNIQUE REFERENCES calendars(id),
 name varchar(120) NOT NULL CHECK(length(trim(name))>0),
 timezone text NOT NULL,
 increment_minutes integer NOT NULL DEFAULT 15 CHECK(increment_minutes IN(5,10,15,30,60)),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organisation_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
 user_id uuid NOT NULL, role varchar(16) NOT NULL CHECK(role IN('owner','manager','member')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,user_id), UNIQUE(id,organisation_id)
);
CREATE UNIQUE INDEX organisation_single_owner ON organisation_memberships(organisation_id) WHERE role='owner';
CREATE TABLE timesheet_staff_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
 membership_id uuid UNIQUE, display_name varchar(100) NOT NULL CHECK(length(trim(display_name))>0),
 email varchar(254) NOT NULL CHECK(email=lower(trim(email)) AND email LIKE '%@%'),
 invite_role varchar(16) NOT NULL DEFAULT 'member' CHECK(invite_role IN('member','manager')),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organisation_id), UNIQUE(organisation_id,email),
 FOREIGN KEY(membership_id,organisation_id) REFERENCES organisation_memberships(id,organisation_id)
);
CREATE TABLE timesheet_manager_assignments (
 organisation_id uuid NOT NULL REFERENCES organisations(id), manager_staff_id uuid NOT NULL, staff_id uuid NOT NULL,
 PRIMARY KEY(manager_staff_id,staff_id), CHECK(manager_staff_id<>staff_id),
 FOREIGN KEY(manager_staff_id,organisation_id) REFERENCES timesheet_staff_profiles(id,organisation_id),
 FOREIGN KEY(staff_id,organisation_id) REFERENCES timesheet_staff_profiles(id,organisation_id)
);
CREATE TABLE timesheet_clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
 name varchar(120) NOT NULL CHECK(length(trim(name))>0), active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), UNIQUE(id,organisation_id)
);
CREATE TABLE timesheet_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), client_id uuid NOT NULL,
 name varchar(120) NOT NULL CHECK(length(trim(name))>0), active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), UNIQUE(id,organisation_id), UNIQUE(id,client_id,organisation_id),
 FOREIGN KEY(client_id,organisation_id) REFERENCES timesheet_clients(id,organisation_id)
);
CREATE TABLE timesheet_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), staff_id uuid NOT NULL,
 email varchar(254) NOT NULL, role varchar(16) NOT NULL CHECK(role IN('member','manager')),
 token_hash varchar(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_by_user_id uuid NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 redeemed_at timestamptz, redeemed_by_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((redeemed_at IS NULL)=(redeemed_by_user_id IS NULL)),
 FOREIGN KEY(staff_id,organisation_id) REFERENCES timesheet_staff_profiles(id,organisation_id)
);
CREATE INDEX timesheet_invite_staff_idx ON timesheet_invitations(organisation_id,staff_id);
CREATE TABLE timesheet_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), staff_id uuid NOT NULL,
 client_id uuid, project_id uuid, start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, timezone text NOT NULL,
 duration_minutes integer GENERATED ALWAYS AS ((extract(epoch FROM(end_at-start_at))/60)::integer) STORED,
 increment_minutes integer NOT NULL CHECK(increment_minutes IN(5,10,15,30,60)),
 notes varchar(4000) NOT NULL DEFAULT '', billable boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), deleted_at timestamptz,
 created_by_user_id uuid NOT NULL, updated_by_user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organisation_id),
 CHECK(isfinite(start_at) AND isfinite(end_at) AND end_at>start_at AND end_at-start_at<=interval '24 hours'),
 CHECK(extract(second FROM start_at)=0 AND extract(second FROM end_at)=0),
 CHECK(mod(extract(epoch FROM(end_at-start_at))::numeric,increment_minutes*60)=0),
 CHECK(project_id IS NULL OR client_id IS NOT NULL),
 FOREIGN KEY(staff_id,organisation_id) REFERENCES timesheet_staff_profiles(id,organisation_id),
 FOREIGN KEY(client_id,organisation_id) REFERENCES timesheet_clients(id,organisation_id),
 FOREIGN KEY(project_id,client_id,organisation_id) REFERENCES timesheet_projects(id,client_id,organisation_id)
);
CREATE INDEX timesheet_entries_window_idx ON timesheet_entries(organisation_id,start_at,end_at) WHERE deleted_at IS NULL;
CREATE INDEX timesheet_entries_staff_idx ON timesheet_entries(organisation_id,staff_id,start_at) WHERE deleted_at IS NULL;
CREATE TABLE timesheet_entry_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), entry_id uuid NOT NULL,
 actor_user_id uuid NOT NULL, reason varchar(500) NOT NULL DEFAULT '', action varchar(16) NOT NULL,
 before_state jsonb, after_state jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(entry_id,organisation_id) REFERENCES timesheet_entries(id,organisation_id)
);
CREATE TABLE timesheet_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
 actor_user_id uuid NOT NULL, action varchar(64) NOT NULL, entity_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);

-- All helpers remain SECURITY INVOKER. Identity comes only from the server's
-- authenticated session. Never pass a browser-supplied actor to these functions.
CREATE FUNCTION timesheet_actor(p_org uuid,p_actor uuid) RETURNS organisation_memberships LANGUAGE sql STABLE AS $$
 SELECT m FROM organisation_memberships m JOIN organisations o ON o.id=m.organisation_id
 JOIN calendars c ON c.id=o.calendar_id JOIN calendar_memberships cm ON cm.calendar_id=c.id AND cm.user_id=m.user_id
 JOIN timesheet_staff_profiles p ON p.membership_id=m.id AND p.organisation_id=o.id
 WHERE o.id=p_org AND m.user_id=p_actor AND m.active AND p.active AND o.archived_at IS NULL
 AND c.archived_at IS NULL AND c.calendar_type::text='timesheets' AND cm.permission<>'viewer'
 AND ((m.role='owner' AND cm.permission='owner') OR (m.role<>'owner' AND cm.permission='editor'))
$$;
CREATE FUNCTION timesheet_can_access(p_org uuid,p_actor uuid,p_staff uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM timesheet_actor(p_org,p_actor) m JOIN timesheet_staff_profiles own ON own.membership_id=m.id AND own.organisation_id=p_org
 JOIN timesheet_staff_profiles target ON target.id=p_staff AND target.organisation_id=p_org
 WHERE m.id IS NOT NULL AND (m.role='owner' OR own.id=target.id OR (m.role='manager' AND EXISTS(
 SELECT 1 FROM timesheet_manager_assignments a WHERE a.organisation_id=p_org AND a.manager_staff_id=own.id AND a.staff_id=target.id))))
$$;
CREATE FUNCTION timesheet_lock(p_org uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 -- Calendar first matches existing archive/delete locks. This serializes all
 -- Timesheets writes including staff, invitations, settings and entry changes.
 PERFORM c.id FROM calendars c JOIN organisations o ON o.calendar_id=c.id WHERE o.id=p_org FOR UPDATE OF c;
 PERFORM id FROM organisations WHERE id=p_org FOR UPDATE;
END $$;
-- Core membership edits use the same calendar lock, preventing a concurrent
-- access revocation from racing an in-flight Timesheets mutation.
CREATE FUNCTION timesheet_serialize_core_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM id FROM calendars WHERE id=NEW.calendar_id AND calendar_type::text='timesheets' FOR UPDATE;
 ELSIF TG_OP='DELETE' THEN
  PERFORM id FROM calendars WHERE id=OLD.calendar_id AND calendar_type::text='timesheets' FOR UPDATE;
 ELSE
  PERFORM id FROM calendars WHERE id IN(OLD.calendar_id,NEW.calendar_id) AND calendar_type::text='timesheets' ORDER BY id FOR UPDATE;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER timesheet_core_membership_lock BEFORE INSERT OR UPDATE OR DELETE ON calendar_memberships
 FOR EACH ROW EXECUTE FUNCTION timesheet_serialize_core_mutation();
CREATE FUNCTION timesheet_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Timesheets history is append-only.' USING ERRCODE='42501'; END $$;
CREATE TRIGGER timesheet_revision_immutable BEFORE UPDATE OR DELETE ON timesheet_entry_revisions FOR EACH ROW EXECUTE FUNCTION timesheet_history_immutable();
CREATE TRIGGER timesheet_audit_immutable BEFORE UPDATE OR DELETE ON timesheet_audit FOR EACH ROW EXECUTE FUNCTION timesheet_history_immutable();

CREATE FUNCTION timesheet_create_organisation(p_calendar uuid,p_actor uuid,p_name text,p_display text,p_email text,p_timezone text)
 RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE org uuid:=gen_random_uuid(); member uuid:=gen_random_uuid();
BEGIN
 IF p_actor IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 120 OR length(trim(p_display)) NOT BETWEEN 1 AND 100
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'Check the organisation details.' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM calendars c JOIN calendar_memberships cm ON cm.calendar_id=c.id WHERE c.id=p_calendar
 AND c.calendar_type::text='timesheets' AND cm.user_id=p_actor AND cm.permission='owner' AND c.archived_at IS NULL AND NOT c.share_enabled) THEN
 RAISE EXCEPTION 'Create a private Timesheets calendar first.' USING ERRCODE='42501'; END IF;
 INSERT INTO organisations(id,calendar_id,name,timezone) VALUES(org,p_calendar,trim(p_name),p_timezone);
 INSERT INTO organisation_memberships(id,organisation_id,user_id,role) VALUES(member,org,p_actor,'owner');
 INSERT INTO timesheet_staff_profiles(organisation_id,membership_id,display_name,email) VALUES(org,member,trim(p_display),lower(trim(p_email)));
 INSERT INTO timesheet_audit(organisation_id,actor_user_id,action,entity_id) VALUES(org,p_actor,'organisation.created',org);
 RETURN org;
END $$;

CREATE FUNCTION timesheet_mutate(p_calendar uuid,p_actor uuid,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE org organisations%ROWTYPE; actor organisation_memberships%ROWTYPE; own timesheet_staff_profiles%ROWTYPE;
 staff timesheet_staff_profiles%ROWTYPE; target_role text; entry timesheet_entries%ROWTYPE; saved timesheet_entries%ROWTYPE;
 client timesheet_clients%ROWTYPE; project timesheet_projects%ROWTYPE; invitation timesheet_invitations%ROWTYPE;
 entity uuid; start_time timestamptz; end_time timestamptz; increment integer; entry_timezone text; unchanged_time boolean; reason text;
BEGIN
 SELECT * INTO org FROM organisations WHERE calendar_id=p_calendar;
 IF org.id IS NULL THEN RAISE EXCEPTION 'Choose a Timesheets calendar.' USING ERRCODE='42501'; END IF;
 PERFORM timesheet_lock(org.id);
 SELECT * INTO org FROM organisations WHERE id=org.id;
 actor:=timesheet_actor(org.id,p_actor);
 IF actor.id IS NULL THEN RAISE EXCEPTION 'Your Timesheets access has changed. Reload the calendar.' USING ERRCODE='42501'; END IF;
 SELECT * INTO own FROM timesheet_staff_profiles WHERE membership_id=actor.id AND organisation_id=org.id;
 IF p_action IN('saveSettings','saveClient','saveProject','assignManager') AND actor.role<>'owner' THEN
 RAISE EXCEPTION 'Only the organisation owner can change this setting.' USING ERRCODE='42501'; END IF;

 IF p_action='saveSettings' THEN
  IF org.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Settings changed. Refresh and try again.' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_data->>'timezone') THEN RAISE EXCEPTION 'Choose a valid timezone.' USING ERRCODE='23514'; END IF;
  UPDATE organisations SET name=trim(p_data->>'name'),timezone=p_data->>'timezone',increment_minutes=(p_data->>'incrementMinutes')::integer,
   version=version+1,updated_at=now() WHERE id=org.id;
  UPDATE calendars SET name=trim(p_data->>'name'),timezone=p_data->>'timezone',updated_at=now() WHERE id=p_calendar;
  entity:=org.id;
 ELSIF p_action='saveStaff' THEN
  IF actor.role='member' THEN RAISE EXCEPTION 'You cannot manage staff.' USING ERRCODE='42501'; END IF;
  SELECT * INTO staff FROM timesheet_staff_profiles WHERE id=(p_data->>'id')::uuid AND organisation_id=org.id;
  IF p_data->>'id' IS NOT NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'Staff profile unavailable.' USING ERRCODE='42501'; END IF;
  IF staff.id IS NOT NULL AND staff.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Staff profile changed. Refresh first.' USING ERRCODE='40001'; END IF;
  SELECT role INTO target_role FROM organisation_memberships WHERE id=staff.membership_id AND organisation_id=org.id;
  IF target_role='owner' OR p_data->>'role' NOT IN('manager','member') THEN RAISE EXCEPTION 'The owner profile cannot be changed here.' USING ERRCODE='42501'; END IF;
  IF actor.role<>'owner' AND (staff.id IS NULL OR NOT timesheet_can_access(org.id,p_actor,staff.id)
   OR COALESCE(target_role,staff.invite_role)<>'member' OR p_data->>'role'<>'member' OR own.id=staff.id) THEN
   RAISE EXCEPTION 'Managers may manage only their assigned member profiles.' USING ERRCODE='42501'; END IF;
  IF staff.membership_id IS NOT NULL AND lower(trim(p_data->>'email')) IS DISTINCT FROM staff.email THEN
   RAISE EXCEPTION 'A linked account email cannot be changed on its staff profile.' USING ERRCODE='23514'; END IF;
  IF staff.id IS NULL THEN
   INSERT INTO timesheet_staff_profiles(organisation_id,display_name,email,invite_role,active)
   VALUES(org.id,trim(p_data->>'displayName'),lower(trim(p_data->>'email')),p_data->>'role',(p_data->>'active')::boolean) RETURNING id INTO entity;
  ELSE
   UPDATE timesheet_staff_profiles SET display_name=trim(p_data->>'displayName'),email=lower(trim(p_data->>'email')),
    invite_role=p_data->>'role',active=(p_data->>'active')::boolean,version=version+1,updated_at=now() WHERE id=staff.id;
   UPDATE organisation_memberships SET role=p_data->>'role',active=(p_data->>'active')::boolean WHERE id=staff.membership_id AND organisation_id=org.id;
   IF staff.email IS DISTINCT FROM lower(trim(p_data->>'email')) OR staff.invite_role IS DISTINCT FROM p_data->>'role' OR NOT (p_data->>'active')::boolean THEN
    UPDATE timesheet_invitations SET revoked_at=COALESCE(revoked_at,now()) WHERE organisation_id=org.id AND redeemed_at IS NULL AND staff_id=staff.id;
   END IF;
   -- Renaming a manager does not revoke their team's links; removing authority does.
   IF NOT (p_data->>'active')::boolean OR target_role IS DISTINCT FROM p_data->>'role' THEN
    UPDATE timesheet_invitations SET revoked_at=COALESCE(revoked_at,now()) WHERE organisation_id=org.id AND redeemed_at IS NULL
     AND created_by_user_id IN(SELECT user_id FROM organisation_memberships WHERE id=staff.membership_id);
   END IF;
   IF p_data->>'role'<>'member' THEN DELETE FROM timesheet_manager_assignments WHERE organisation_id=org.id AND staff_id=staff.id; END IF;
   entity:=staff.id;
  END IF;
 ELSIF p_action='assignManager' THEN
  IF (p_data->>'assigned')::boolean AND (NOT EXISTS(SELECT 1 FROM timesheet_staff_profiles p LEFT JOIN organisation_memberships m ON m.id=p.membership_id
   WHERE p.id=(p_data->>'managerStaffId')::uuid AND p.organisation_id=org.id AND p.active AND COALESCE(m.role,p.invite_role)='manager')
   OR NOT EXISTS(SELECT 1 FROM timesheet_staff_profiles p LEFT JOIN organisation_memberships m ON m.id=p.membership_id
   WHERE p.id=(p_data->>'staffId')::uuid AND p.organisation_id=org.id AND p.active AND COALESCE(m.role,p.invite_role)='member')) THEN
   RAISE EXCEPTION 'Assign an active manager to an active member in this organisation.' USING ERRCODE='23514'; END IF;
  IF (p_data->>'assigned')::boolean THEN
   INSERT INTO timesheet_manager_assignments(organisation_id,manager_staff_id,staff_id) VALUES(org.id,(p_data->>'managerStaffId')::uuid,(p_data->>'staffId')::uuid) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM timesheet_manager_assignments WHERE organisation_id=org.id AND manager_staff_id=(p_data->>'managerStaffId')::uuid AND staff_id=(p_data->>'staffId')::uuid;
   UPDATE timesheet_invitations SET revoked_at=COALESCE(revoked_at,now()) WHERE organisation_id=org.id AND staff_id=(p_data->>'staffId')::uuid AND redeemed_at IS NULL
    AND created_by_user_id IN(SELECT m.user_id FROM organisation_memberships m JOIN timesheet_staff_profiles p ON p.membership_id=m.id WHERE p.id=(p_data->>'managerStaffId')::uuid AND p.organisation_id=org.id);
  END IF;
  entity:=(p_data->>'staffId')::uuid;
 ELSIF p_action='saveClient' THEN
  SELECT * INTO client FROM timesheet_clients WHERE id=(p_data->>'id')::uuid AND organisation_id=org.id;
  IF p_data->>'id' IS NOT NULL AND client.id IS NULL THEN RAISE EXCEPTION 'Client unavailable.' USING ERRCODE='42501'; END IF;
  IF client.id IS NOT NULL AND client.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Client changed. Refresh first.' USING ERRCODE='40001'; END IF;
  IF client.id IS NULL THEN
   INSERT INTO timesheet_clients(organisation_id,name,active) VALUES(org.id,trim(p_data->>'name'),(p_data->>'active')::boolean) RETURNING id INTO entity;
  ELSE
   UPDATE timesheet_clients SET name=trim(p_data->>'name'),active=(p_data->>'active')::boolean,version=version+1 WHERE id=client.id; entity:=client.id;
  END IF;
 ELSIF p_action='saveProject' THEN
  SELECT * INTO project FROM timesheet_projects WHERE id=(p_data->>'id')::uuid AND organisation_id=org.id;
  IF p_data->>'id' IS NOT NULL AND project.id IS NULL THEN RAISE EXCEPTION 'Project unavailable.' USING ERRCODE='42501'; END IF;
  IF project.id IS NOT NULL AND project.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Project changed. Refresh first.' USING ERRCODE='40001'; END IF;
  IF project.id IS NOT NULL AND project.client_id IS DISTINCT FROM (p_data->>'clientId')::uuid THEN RAISE EXCEPTION 'A saved project keeps its original client.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM timesheet_clients WHERE id=(p_data->>'clientId')::uuid AND organisation_id=org.id AND (active OR (project.id IS NOT NULL AND NOT (p_data->>'active')::boolean))) THEN RAISE EXCEPTION 'Choose an active client in this organisation.' USING ERRCODE='23514'; END IF;
  IF project.id IS NULL THEN
   INSERT INTO timesheet_projects(organisation_id,client_id,name,active) VALUES(org.id,(p_data->>'clientId')::uuid,trim(p_data->>'name'),(p_data->>'active')::boolean) RETURNING id INTO entity;
  ELSE
   UPDATE timesheet_projects SET name=trim(p_data->>'name'),active=(p_data->>'active')::boolean,version=version+1 WHERE id=project.id; entity:=project.id;
  END IF;
 ELSIF p_action IN('createInvite','revokeInvite') THEN
  IF p_action='revokeInvite' THEN
   SELECT * INTO invitation FROM timesheet_invitations WHERE id=(p_data->>'id')::uuid AND organisation_id=org.id;
   SELECT * INTO staff FROM timesheet_staff_profiles WHERE id=invitation.staff_id AND organisation_id=org.id;
  ELSE
   SELECT * INTO staff FROM timesheet_staff_profiles WHERE id=(p_data->>'staffId')::uuid AND organisation_id=org.id;
  END IF;
  IF staff.id IS NULL OR actor.role='member' OR (actor.role<>'owner' AND (staff.invite_role<>'member' OR NOT timesheet_can_access(org.id,p_actor,staff.id) OR staff.id=own.id)) THEN
   RAISE EXCEPTION 'You cannot manage this invitation.' USING ERRCODE='42501'; END IF;
  IF p_action='revokeInvite' THEN
   UPDATE timesheet_invitations SET revoked_at=COALESCE(revoked_at,now()) WHERE id=invitation.id; entity:=invitation.id;
  ELSE
   IF NOT staff.active OR staff.membership_id IS NOT NULL THEN RAISE EXCEPTION 'Only active unlinked staff can be invited.' USING ERRCODE='23514'; END IF;
   UPDATE timesheet_invitations SET revoked_at=COALESCE(revoked_at,now()) WHERE organisation_id=org.id AND staff_id=staff.id AND redeemed_at IS NULL;
   INSERT INTO timesheet_invitations(organisation_id,staff_id,email,role,token_hash,created_by_user_id,expires_at)
   VALUES(org.id,staff.id,staff.email,staff.invite_role,p_data->>'tokenHash',p_actor,now()+interval '7 days') RETURNING id INTO entity;
  END IF;
 ELSIF p_action IN('saveEntry','deleteEntry') THEN
  SELECT * INTO entry FROM timesheet_entries WHERE id=(p_data->>'id')::uuid AND organisation_id=org.id AND deleted_at IS NULL;
  IF p_data->>'id' IS NOT NULL AND entry.id IS NULL THEN RAISE EXCEPTION 'Entry unavailable.' USING ERRCODE='42501'; END IF;
  IF entry.id IS NOT NULL AND entry.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Entry changed. Refresh before saving.' USING ERRCODE='40001'; END IF;
  SELECT * INTO staff FROM timesheet_staff_profiles WHERE id=COALESCE(entry.staff_id,(p_data->>'staffId')::uuid) AND organisation_id=org.id;
  IF staff.id IS NULL OR NOT timesheet_can_access(org.id,p_actor,staff.id) THEN RAISE EXCEPTION 'You cannot change this person’s time.' USING ERRCODE='42501'; END IF;
  reason:=trim(COALESCE(p_data->>'reason',''));
  IF own.id<>staff.id AND length(reason)<3 THEN RAISE EXCEPTION 'Give a reason for changing another person’s time.' USING ERRCODE='23514'; END IF;
  IF p_action='deleteEntry' THEN
   IF entry.id IS NULL THEN RAISE EXCEPTION 'Entry unavailable.' USING ERRCODE='42501'; END IF;
   UPDATE timesheet_entries SET deleted_at=now(),version=version+1,updated_at=now(),updated_by_user_id=p_actor WHERE id=entry.id RETURNING * INTO saved;
  ELSE
   IF NOT staff.active OR (entry.id IS NOT NULL AND entry.staff_id IS DISTINCT FROM (p_data->>'staffId')::uuid) THEN RAISE EXCEPTION 'Choose the original active staff profile.' USING ERRCODE='23514'; END IF;
   IF org.version IS DISTINCT FROM (p_data->>'expectedOrganisationVersion')::integer THEN RAISE EXCEPTION 'Organisation settings changed. Refresh first.' USING ERRCODE='40001'; END IF;
   start_time:=(p_data->>'start')::timestamptz; end_time:=(p_data->>'end')::timestamptz;
   unchanged_time:=entry.id IS NOT NULL AND entry.start_at=start_time AND entry.end_at=end_time;
   increment:=CASE WHEN unchanged_time THEN entry.increment_minutes ELSE org.increment_minutes END;
   entry_timezone:=CASE WHEN unchanged_time THEN entry.timezone ELSE org.timezone END;
   IF p_data->>'timezone' IS DISTINCT FROM entry_timezone THEN RAISE EXCEPTION 'Timezone changed. Reload the entry.' USING ERRCODE='40001'; END IF;
   IF NOT isfinite(start_time) OR NOT isfinite(end_time) OR end_time<=start_time OR end_time-start_time>interval '24 hours'
    OR extract(second FROM start_time)<>0 OR extract(second FROM end_time)<>0 OR mod(extract(epoch FROM(end_time-start_time))::numeric,increment*60)<>0 THEN
    RAISE EXCEPTION 'Duration must be an exact whole multiple of the selected time increment, up to 24 hours.' USING ERRCODE='23514'; END IF;
   IF p_data->>'clientId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM timesheet_clients WHERE id=(p_data->>'clientId')::uuid AND organisation_id=org.id AND (active OR (unchanged_time AND entry.client_id=id))) THEN RAISE EXCEPTION 'Choose an active client in this organisation.' USING ERRCODE='23514'; END IF;
   IF p_data->>'projectId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM timesheet_projects WHERE id=(p_data->>'projectId')::uuid AND organisation_id=org.id AND client_id=(p_data->>'clientId')::uuid AND (active OR (unchanged_time AND entry.project_id=id))) THEN RAISE EXCEPTION 'Choose an active project belonging to this client.' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM timesheet_entries e WHERE e.organisation_id=org.id AND e.staff_id=staff.id AND e.deleted_at IS NULL
    AND e.id<>COALESCE(entry.id,'00000000-0000-0000-0000-000000000000'::uuid) AND e.start_at<end_time AND e.end_at>start_time) THEN
    RAISE EXCEPTION 'This work block overlaps an existing entry.' USING ERRCODE='23514'; END IF;
   IF entry.id IS NULL THEN
    INSERT INTO timesheet_entries(organisation_id,staff_id,client_id,project_id,start_at,end_at,timezone,increment_minutes,notes,billable,created_by_user_id,updated_by_user_id)
    VALUES(org.id,staff.id,(p_data->>'clientId')::uuid,(p_data->>'projectId')::uuid,start_time,end_time,entry_timezone,increment,COALESCE(p_data->>'notes',''),(p_data->>'billable')::boolean,p_actor,p_actor) RETURNING * INTO saved;
   ELSE
    UPDATE timesheet_entries SET client_id=(p_data->>'clientId')::uuid,project_id=(p_data->>'projectId')::uuid,start_at=start_time,end_at=end_time,
     timezone=entry_timezone,increment_minutes=increment,notes=COALESCE(p_data->>'notes',''),billable=(p_data->>'billable')::boolean,version=version+1,updated_at=now(),updated_by_user_id=p_actor WHERE id=entry.id RETURNING * INTO saved;
   END IF;
  END IF;
  INSERT INTO timesheet_entry_revisions(organisation_id,entry_id,actor_user_id,reason,action,before_state,after_state)
   VALUES(org.id,saved.id,p_actor,reason,CASE WHEN p_action='deleteEntry' THEN 'delete' WHEN entry.id IS NULL THEN 'create' ELSE 'update' END,
    CASE WHEN entry.id IS NULL THEN NULL ELSE to_jsonb(entry) END,to_jsonb(saved));
  entity:=saved.id;
 ELSE RAISE EXCEPTION 'Unknown Timesheets action.' USING ERRCODE='23514';
 END IF;
 INSERT INTO timesheet_audit(organisation_id,actor_user_id,action,entity_id) VALUES(org.id,p_actor,p_action,entity);
 RETURN jsonb_build_object('ok',true,'id',entity);
END $$;

CREATE FUNCTION timesheet_redeem_invitation(p_token_hash text,p_actor uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE invitation timesheet_invitations%ROWTYPE; staff timesheet_staff_profiles%ROWTYPE; org organisations%ROWTYPE;
 inviter organisation_memberships%ROWTYPE; account_email text; account_verified boolean; member uuid;
BEGIN
 SELECT * INTO invitation FROM timesheet_invitations WHERE token_hash=p_token_hash;
 IF invitation.id IS NULL OR p_actor IS NULL THEN RAISE EXCEPTION 'This invitation is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM timesheet_lock(invitation.organisation_id);
 SELECT * INTO invitation FROM timesheet_invitations WHERE id=invitation.id;
 SELECT * INTO org FROM organisations WHERE id=invitation.organisation_id;
 SELECT * INTO staff FROM timesheet_staff_profiles WHERE id=invitation.staff_id AND organisation_id=org.id;
 -- Read only the trusted Auth user profile. A grandfathered session is not proof
 -- of email verification. No client field can substitute for this check.
 SELECT lower(trim(email)),"emailVerified" INTO account_email,account_verified FROM neon_auth."user" WHERE id=p_actor;
 IF account_verified IS DISTINCT FROM true OR account_email IS DISTINCT FROM invitation.email THEN
  RAISE EXCEPTION 'Sign in with the verified email address this invitation was sent to.' USING ERRCODE='42501'; END IF;
 IF invitation.redeemed_by_user_id=p_actor AND invitation.revoked_at IS NULL AND staff.active
  AND EXISTS(SELECT 1 FROM organisation_memberships WHERE id=staff.membership_id AND user_id=p_actor AND active)
  AND (timesheet_actor(org.id,p_actor)).id IS NOT NULL THEN RETURN org.calendar_id; END IF;
 inviter:=timesheet_actor(org.id,invitation.created_by_user_id);
 IF invitation.revoked_at IS NOT NULL OR invitation.redeemed_at IS NOT NULL OR invitation.expires_at<=clock_timestamp()
  OR org.archived_at IS NOT NULL OR NOT staff.active OR staff.membership_id IS NOT NULL OR staff.email<>invitation.email
  OR staff.invite_role<>invitation.role OR inviter.id IS NULL OR inviter.role NOT IN('owner','manager')
  OR (inviter.role='manager' AND (invitation.role<>'member' OR NOT timesheet_can_access(org.id,inviter.user_id,staff.id))) THEN
  RAISE EXCEPTION 'This invitation is unavailable. Ask for a new invitation.' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM organisation_memberships WHERE organisation_id=org.id AND user_id=p_actor)
  OR EXISTS(SELECT 1 FROM calendar_memberships WHERE calendar_id=org.calendar_id AND user_id=p_actor) THEN
  RAISE EXCEPTION 'This account already has an organisation profile. Ask the owner to review access.' USING ERRCODE='23514'; END IF;
 INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES(org.calendar_id,p_actor,'editor');
 INSERT INTO organisation_memberships(organisation_id,user_id,role) VALUES(org.id,p_actor,invitation.role) RETURNING id INTO member;
 UPDATE timesheet_staff_profiles SET membership_id=member,version=version+1,updated_at=now() WHERE id=staff.id;
 UPDATE timesheet_invitations SET redeemed_at=now(),redeemed_by_user_id=p_actor WHERE id=invitation.id;
 INSERT INTO timesheet_audit(organisation_id,actor_user_id,action,entity_id) VALUES(org.id,p_actor,'invitation.accepted',staff.id);
 RETURN org.calendar_id;
END $$;

-- Deliberately no SECURITY DEFINER, Auth write privileges, new credentials,
-- OAuth grants, public sharing, outbound jobs or integration permissions.
INSERT INTO covie_schema_migrations(migration_id,description,baseline)
 VALUES('0036','Standalone organisation Timesheets, scoped work entries and verified-email invitations',false);
