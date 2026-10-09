-- ACTION-TIME APPROVAL REQUIRED. Proposed least-privilege runtime bundle for
-- migration 0036 only. Run as the existing migration owner after schema creation.
-- Creates no roles, credentials, Auth grants or external access.
REVOKE ALL ON organisations, organisation_memberships, timesheet_staff_profiles,
 timesheet_manager_assignments, timesheet_clients, timesheet_projects,
 timesheet_invitations, timesheet_entries, timesheet_entry_revisions, timesheet_audit FROM PUBLIC;
REVOKE ALL ON organisations, organisation_memberships, timesheet_staff_profiles,
 timesheet_manager_assignments, timesheet_clients, timesheet_projects,
 timesheet_invitations, timesheet_entries, timesheet_entry_revisions, timesheet_audit FROM covie_app;
GRANT SELECT,INSERT,UPDATE ON organisations,organisation_memberships,timesheet_staff_profiles,
 timesheet_clients,timesheet_projects,timesheet_invitations,timesheet_entries TO covie_app;
GRANT SELECT,INSERT,DELETE ON timesheet_manager_assignments TO covie_app;
GRANT SELECT,INSERT ON timesheet_entry_revisions,timesheet_audit TO covie_app;
REVOKE EXECUTE ON FUNCTION timesheet_actor(uuid,uuid),timesheet_can_access(uuid,uuid,uuid),
 timesheet_lock(uuid),timesheet_serialize_core_mutation(),timesheet_history_immutable(),
 timesheet_create_organisation(uuid,uuid,text,text,text,text),timesheet_mutate(uuid,uuid,text,jsonb),
 timesheet_redeem_invitation(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION timesheet_actor(uuid,uuid),timesheet_can_access(uuid,uuid,uuid),
 timesheet_lock(uuid),timesheet_serialize_core_mutation(),timesheet_history_immutable(),
 timesheet_create_organisation(uuid,uuid,text,text,text,text),timesheet_mutate(uuid,uuid,text,jsonb),
 timesheet_redeem_invitation(text,uuid) TO covie_app;
