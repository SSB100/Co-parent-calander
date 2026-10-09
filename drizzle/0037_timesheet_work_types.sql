-- Additive Timesheets-only custom work types. Apply once after 0036.
-- No seeded categories, billable defaults, payroll rules, history rewrites or Auth changes.
CREATE TABLE timesheet_work_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
 name varchar(120) NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120 AND name=trim(name)),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(id,organisation_id)
);
CREATE UNIQUE INDEX timesheet_work_types_org_name_unique ON timesheet_work_types(organisation_id,lower(name));
ALTER TABLE timesheet_entries ADD COLUMN work_type_id uuid, ADD COLUMN work_type_name varchar(120),
 ADD CONSTRAINT timesheet_entries_work_type_tenant_fk FOREIGN KEY(work_type_id,organisation_id) REFERENCES timesheet_work_types(id,organisation_id),
 ADD CONSTRAINT timesheet_entries_work_type_snapshot_check CHECK(
  (work_type_id IS NULL AND work_type_name IS NULL) OR
  (work_type_id IS NOT NULL AND work_type_name IS NOT NULL AND length(trim(work_type_name)) BETWEEN 1 AND 120)
 );
REVOKE ALL ON timesheet_work_types FROM PUBLIC;

-- Same signature and SECURITY INVOKER boundary; existing function grants are retained.
-- Shares the calendar/organisation locks used by all Timesheets mutations.
CREATE OR REPLACE FUNCTION timesheet_mutate(p_calendar uuid,p_actor uuid,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE org organisations%ROWTYPE; actor organisation_memberships%ROWTYPE; own timesheet_staff_profiles%ROWTYPE;
 staff timesheet_staff_profiles%ROWTYPE; target_role text; entry timesheet_entries%ROWTYPE; saved timesheet_entries%ROWTYPE;
 client timesheet_clients%ROWTYPE; project timesheet_projects%ROWTYPE; invitation timesheet_invitations%ROWTYPE;
 work_type timesheet_work_types%ROWTYPE; selected_work_type uuid; selected_work_name text;
 entity uuid; start_time timestamptz; end_time timestamptz; increment integer; entry_timezone text; unchanged_time boolean; reason text;
BEGIN
 SELECT * INTO org FROM organisations WHERE calendar_id=p_calendar;
 IF org.id IS NULL THEN RAISE EXCEPTION 'Choose a Timesheets calendar.' USING ERRCODE='42501'; END IF;
 PERFORM timesheet_lock(org.id);
 SELECT * INTO org FROM organisations WHERE id=org.id;
 actor:=timesheet_actor(org.id,p_actor);
 IF actor.id IS NULL THEN RAISE EXCEPTION 'Your Timesheets access has changed. Reload the calendar.' USING ERRCODE='42501'; END IF;
 SELECT * INTO own FROM timesheet_staff_profiles WHERE membership_id=actor.id AND organisation_id=org.id;
 IF p_action IN('saveSettings','saveClient','saveProject','saveWorkType','assignManager') AND actor.role<>'owner' THEN
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
 ELSIF p_action='saveWorkType' THEN
  SELECT * INTO work_type FROM timesheet_work_types WHERE id=(p_data->>'id')::uuid AND organisation_id=org.id;
  IF p_data->>'id' IS NOT NULL AND work_type.id IS NULL THEN RAISE EXCEPTION 'Work type unavailable.' USING ERRCODE='42501'; END IF;
  IF work_type.id IS NOT NULL AND work_type.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Work type changed. Refresh first.' USING ERRCODE='40001'; END IF;
  IF work_type.id IS NULL THEN
   INSERT INTO timesheet_work_types(organisation_id,name,active) VALUES(org.id,trim(p_data->>'name'),(p_data->>'active')::boolean) RETURNING id INTO entity;
  ELSE
   UPDATE timesheet_work_types SET name=trim(p_data->>'name'),active=(p_data->>'active')::boolean,version=version+1 WHERE id=work_type.id; entity:=work_type.id;
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
   -- Missing workTypeId is backward compatible with already-open clients.
   -- Retaining an entry's type retains its original label, even after rename/archive.
   selected_work_type:=CASE WHEN p_data ? 'workTypeId' THEN (p_data->>'workTypeId')::uuid ELSE entry.work_type_id END;
   selected_work_name:=NULL;
   IF selected_work_type IS NOT NULL THEN
    SELECT * INTO work_type FROM timesheet_work_types WHERE id=selected_work_type AND organisation_id=org.id;
    IF work_type.id IS NULL OR (NOT work_type.active AND selected_work_type IS DISTINCT FROM entry.work_type_id) THEN
     RAISE EXCEPTION 'Choose an active work type in this organisation.' USING ERRCODE='23514'; END IF;
    selected_work_name:=CASE WHEN selected_work_type=entry.work_type_id THEN entry.work_type_name ELSE work_type.name END;
   END IF;
   IF EXISTS(SELECT 1 FROM timesheet_entries e WHERE e.organisation_id=org.id AND e.staff_id=staff.id AND e.deleted_at IS NULL
    AND e.id<>COALESCE(entry.id,'00000000-0000-0000-0000-000000000000'::uuid) AND e.start_at<end_time AND e.end_at>start_time) THEN
    RAISE EXCEPTION 'This work block overlaps an existing entry.' USING ERRCODE='23514'; END IF;
   IF entry.id IS NULL THEN
    INSERT INTO timesheet_entries(organisation_id,staff_id,client_id,project_id,work_type_id,work_type_name,start_at,end_at,timezone,increment_minutes,notes,billable,created_by_user_id,updated_by_user_id)
    VALUES(org.id,staff.id,(p_data->>'clientId')::uuid,(p_data->>'projectId')::uuid,selected_work_type,selected_work_name,start_time,end_time,entry_timezone,increment,COALESCE(p_data->>'notes',''),(p_data->>'billable')::boolean,p_actor,p_actor) RETURNING * INTO saved;
   ELSE
    UPDATE timesheet_entries SET client_id=(p_data->>'clientId')::uuid,project_id=(p_data->>'projectId')::uuid,work_type_id=selected_work_type,work_type_name=selected_work_name,start_at=start_time,end_at=end_time,
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

INSERT INTO covie_schema_migrations(migration_id,description,baseline) VALUES('0037','Organisation work types and stable entry label snapshots',false);
