-- ACTION-TIME APPROVAL REQUIRED in production. Apply after 0037 as migration owner.
-- Existing covie_app only; no new role, credential, Auth grant or wider domain access.
REVOKE ALL ON timesheet_work_types FROM PUBLIC;
REVOKE ALL ON timesheet_work_types FROM covie_app;
GRANT SELECT,INSERT,UPDATE ON timesheet_work_types TO covie_app;
-- Existing timesheet_entries table-level rights include the new nullable columns.
-- CREATE OR REPLACE keeps timesheet_mutate's existing restricted EXECUTE grants.
