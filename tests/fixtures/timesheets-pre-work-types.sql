-- Synthetic upgrade fixture only. Run in a fresh test database after 0036 and before 0037.
INSERT INTO neon_auth."user"(id,name,email,"emailVerified") VALUES
 ('37000000-0000-4000-8000-000000000001','Legacy fixture owner','legacy-work-type@example.invalid',true);
INSERT INTO calendars(id,name,calendar_type,timezone) VALUES
 ('37000000-0000-4000-8000-000000000002','Legacy Timesheets fixture','timesheets','UTC');
INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES
 ('37000000-0000-4000-8000-000000000002','37000000-0000-4000-8000-000000000001','owner');
SELECT timesheet_create_organisation('37000000-0000-4000-8000-000000000002','37000000-0000-4000-8000-000000000001',
 'Legacy Timesheets fixture','Legacy fixture owner','legacy-work-type@example.invalid','UTC');
SELECT timesheet_mutate('37000000-0000-4000-8000-000000000002','37000000-0000-4000-8000-000000000001','saveEntry',
 jsonb_build_object('staffId',p.id,'clientId',NULL,'projectId',NULL,'start','2026-10-12T09:00:00Z','end','2026-10-12T09:15:00Z',
 'timezone','UTC','notes','Saved before custom work types','billable',false,'expectedOrganisationVersion',1))
 FROM timesheet_staff_profiles p JOIN organisations o ON o.id=p.organisation_id
 WHERE o.calendar_id='37000000-0000-4000-8000-000000000002';
