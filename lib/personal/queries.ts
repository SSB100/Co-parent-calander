/** All adapters recheck active membership in the statement that reads source rows.
 * Parameters are user ID, first local day, next month, optional source calendar ID.
 * This module deliberately contains SELECT statements only.
 */
const access = `WITH bounds AS (SELECT $2::date AS first_day,$3::date AS next_month), permitted AS (
 SELECT c.id, c.name, c.calendar_type, c.timezone, m.id AS membership_id,
 m.permission, p.id AS participant_id
 FROM calendars c JOIN calendar_memberships m ON m.calendar_id=c.id
 LEFT JOIN participants p ON p.id=m.participant_id AND p.calendar_id=c.id AND p.active
 WHERE m.user_id=$1::uuid AND c.archived_at IS NULL
 AND ($4::uuid IS NULL OR c.id=$4::uuid)
)`;
const identity = `p.id::text AS "calendarId", p.timezone`;
const timedRange = `start_at < ($3::date + interval '2 days')::timestamptz AND end_at > ($2::date - interval '2 days')::timestamptz`;
export const personalSourcesSql = `SELECT c.id::text,
 CASE WHEN m.id IS NOT NULL THEN c.name ELSE COALESCE((SELECT NULLIF(s.business_name,'') FROM salon_settings s WHERE s.calendar_id=c.id),'Salon') END AS name,
 c.calendar_type AS type,c.timezone,
 concat_ws(':',COALESCE(m.id::text,'client'),m.permission,m.participant_id,m.updated_at,c.timezone,
 (SELECT p.updated_at::text || ':' || p.active::text FROM participants p WHERE p.id=m.participant_id AND p.calendar_id=c.id),
 (SELECT s.updated_at::text || ':' || s.active::text FROM staff_roster_members s WHERE s.membership_id=m.id AND s.calendar_id=c.id),
 (SELECT p.updated_at::text || ':' || p.active::text FROM salon_practitioners p WHERE p.user_id=$1::uuid AND p.calendar_id=c.id)) AS "accessKey"
 FROM calendars c LEFT JOIN calendar_memberships m ON m.calendar_id=c.id AND m.user_id=$1::uuid
 WHERE c.archived_at IS NULL AND (m.id IS NOT NULL OR (c.calendar_type='salon_bookings' AND EXISTS(SELECT 1 FROM salon_appointments a WHERE a.calendar_id=c.id AND a.client_user_id=$1::uuid)))
 ORDER BY m.created_at NULLS LAST,c.created_at,c.id`;
export const personalQueries = {
 shifts: `${access} SELECT ${identity}, s.id::text AS "sourceId", 'shift' AS kind,
 'confirmed' AS state, COALESCE(r.name,'Work shift') AS title, COALESCE(l.name,'Published shift') AS detail,
 s.shift_date::text AS date,s.shift_date::text AS "endDate",
 (s.shift_date+s.start_time) AT TIME ZONE p.timezone AS start,
 (s.shift_date+s.end_time) AT TIME ZONE p.timezone AS "end",'calendar' AS "sourceTarget"
 FROM permitted p JOIN staff_roster_members member ON member.membership_id=p.membership_id
 AND member.calendar_id=p.id AND member.active
 JOIN staff_roster_published_shifts s ON s.member_id=member.id
 JOIN staff_roster_week_publications publication ON publication.id=s.publication_id AND publication.calendar_id=p.id
 LEFT JOIN staff_roster_roles r ON r.id=s.role_id AND r.calendar_id=p.id
 LEFT JOIN staff_roster_locations l ON l.id=s.location_id AND l.calendar_id=p.id
 WHERE p.calendar_type='staff_rosters' AND s.shift_date >= $2::date-2 AND s.shift_date < $3::date+2
 ORDER BY s.shift_date,s.start_time,s.id LIMIT 1001`,
 facilities: `${access} SELECT ${identity}, b.id::text AS "sourceId", 'facility' AS kind,
 CASE WHEN b.status='pending' THEN 'tentative' ELSE 'confirmed' END AS state,
 COALESCE(NULLIF(b.title,''),r.name) AS title,r.name AS detail,
 (b.start_at AT TIME ZONE p.timezone)::date::text AS date,
 ((b.end_at-interval '1 millisecond') AT TIME ZONE p.timezone)::date::text AS "endDate",
 b.start_at AS start,b.end_at AS "end",'calendar' AS "sourceTarget"
 FROM permitted p JOIN facility_bookings b ON b.calendar_id=p.id AND b.user_id=$1::uuid
 JOIN facility_resources r ON r.id=b.resource_id AND r.calendar_id=p.id
 WHERE p.calendar_type='shared_facilities' AND b.status IN ('confirmed','pending') AND ${timedRange}
 ORDER BY b.start_at,b.id LIMIT 1001`,
 social: `${access} SELECT ${identity}, e.id::text AS "sourceId", 'social' AS kind,
 CASE WHEN response.response='going' THEN 'confirmed' ELSE 'tentative' END AS state,
 e.title,CASE WHEN response.response='going' THEN 'Going' ELSE 'Maybe' END AS detail,
 (e.start_at AT TIME ZONE p.timezone)::date::text AS date,
 ((e.end_at-interval '1 millisecond') AT TIME ZONE p.timezone)::date::text AS "endDate",
 e.start_at AS start,e.end_at AS "end",'calendar' AS "sourceTarget"
 FROM permitted p JOIN social_events e ON e.calendar_id=p.id AND NOT e.cancelled
 JOIN social_rsvps response ON response.event_id=e.id AND response.calendar_id=p.id AND response.user_id=$1::uuid
 WHERE p.calendar_type='social_groups' AND response.response IN ('going','maybe') AND ${timedRange}
 ORDER BY e.start_at,e.id LIMIT 1001`,
 organising: `${access} SELECT ${identity}, e.id::text AS "sourceId", 'organising' AS kind,
 'attention' AS state,e.title,'You organise this event. Attendance follows your RSVP.' AS detail,
 (e.start_at AT TIME ZONE p.timezone)::date::text AS date,
 (e.start_at AT TIME ZONE p.timezone)::date::text AS "endDate",
 NULL AS start,NULL AS "end",'calendar' AS "sourceTarget"
 FROM permitted p JOIN social_events e ON e.calendar_id=p.id AND e.created_by_user_id=$1::uuid AND NOT e.cancelled
 WHERE p.calendar_type='social_groups' AND p.permission<>'viewer' AND e.end_at>now()
 AND (e.start_at AT TIME ZONE p.timezone)::date >= $2::date AND (e.start_at AT TIME ZONE p.timezone)::date < $3::date
 ORDER BY e.start_at,e.id LIMIT 1001`,
 tasks: `${access} SELECT ${identity}, t.id::text AS "sourceId", 'task' AS kind,
 'attention' AS state,t.title,CASE WHEN t.due_time IS NOT NULL THEN 'Due at ' || to_char(t.due_time,'HH24:MI') || ' (' || p.timezone || '). ' ELSE '' END || 'Assigned to you. Open the task to review or complete it.' AS detail,
 t.due_date::text AS date,t.due_date::text AS "endDate",NULL AS start,NULL AS "end",'tasks' AS "sourceTarget"
 FROM permitted p JOIN responsibilities t ON t.calendar_id=p.id AND t.responsible_participant_id=p.participant_id
 WHERE p.calendar_type='co_parenting' AND p.permission<>'viewer' AND t.completed_at IS NULL AND t.due_date<$3::date
 ORDER BY t.due_date,t.id LIMIT 1001`,
 expenses: `${access} SELECT ${identity}, e.id::text AS "sourceId", 'expense' AS kind,
 'attention' AS state,e.title,'Your recorded share has an unpaid balance. Review the source before acting.' AS detail,
 COALESCE(e.due_date,e.expense_date)::text AS date,COALESCE(e.due_date,e.expense_date)::text AS "endDate",
 NULL AS start,NULL AS "end",'expenses' AS "sourceTarget"
 FROM permitted p JOIN expenses e ON e.calendar_id=p.id AND e.paid_by_participant_id<>p.participant_id
 JOIN expense_shares share ON share.expense_id=e.id AND share.participant_id=p.participant_id
 WHERE p.calendar_type='co_parenting' AND p.permission<>'viewer' AND e.settlement_status='outstanding'
 AND share.share_cents>share.paid_cents AND COALESCE(e.due_date,e.expense_date)<$3::date
 ORDER BY COALESCE(e.due_date,e.expense_date),e.id LIMIT 1001`,
 approvals: `${access} SELECT ${identity}, a.id::text AS "sourceId", 'approval' AS kind,
 'attention' AS state,'Review a proposed change' AS title,'Waiting for your response.' AS detail,
 (a.created_at AT TIME ZONE p.timezone)::date::text AS date,
 (a.created_at AT TIME ZONE p.timezone)::date::text AS "endDate",
 NULL AS start,NULL AS "end",'approvals' AS "sourceTarget"
 FROM permitted p JOIN approval_proposals a ON a.calendar_id=p.id AND a.approver_membership_id=p.membership_id
 WHERE p.calendar_type='co_parenting' AND p.permission<>'viewer' AND a.status='waiting'
 ORDER BY a.created_at,a.id LIMIT 1001`,
 salon: `SELECT c.id::text AS "calendarId", c.timezone, a.id::text AS "sourceId", 'appointment' AS kind,
   'confirmed' AS state,a.service_name AS title,
   CASE WHEN a.client_user_id=$1::uuid THEN p.display_name || ' · Your appointment' ELSE 'Assigned to you. Open the source for client details.' END AS detail,
   (a.start_at AT TIME ZONE c.timezone)::date::text AS date,
   ((a.end_at-interval '1 millisecond') AT TIME ZONE c.timezone)::date::text AS "endDate",
   a.start_at AS start,a.end_at AS "end",'appointment' AS "sourceTarget"
   FROM salon_appointments a JOIN calendars c ON c.id=a.calendar_id
   JOIN salon_practitioners p ON p.id=a.practitioner_id AND p.calendar_id=c.id
   LEFT JOIN calendar_memberships m ON m.calendar_id=c.id AND m.user_id=$1::uuid
   WHERE c.calendar_type='salon_bookings' AND c.archived_at IS NULL
   AND ($4::uuid IS NULL OR c.id=$4::uuid) AND a.status='confirmed'
   AND (a.client_user_id=$1::uuid OR (p.user_id=$1::uuid AND p.active AND m.permission IN ('owner','editor')))
   AND a.start_at<($3::date+interval '2 days')::timestamptz AND a.end_at>($2::date-interval '2 days')::timestamptz
   ORDER BY a.start_at,a.id LIMIT 1001`,
 care: `${access} SELECT ${identity}, p.participant_id::text AS "participantId",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.display_name)) FROM children c WHERE c.calendar_id=p.id AND c.active),'[]') AS children,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'childId',a.child_id,'date',a.assignment_date,'morningParentId',a.parent_id,'afternoonParentId',a.afternoon_parent_id,'handoverTime',a.handover_time,'handoverLocation',NULL,'note',NULL)) FROM parenting_assignments a JOIN children c ON c.id=a.child_id AND c.calendar_id=p.id AND c.active WHERE a.calendar_id=p.id AND a.assignment_date >= $2::date AND a.assignment_date < $3::date),'[]') AS "manualAssignments",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'anchorDate',s.anchor_date,'endDate',s.end_date)) FROM parenting_schedules s WHERE s.calendar_id=p.id AND s.active AND s.anchor_date<$3::date AND (s.end_date IS NULL OR s.end_date >= $2::date)),'[]') AS schedules,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('scheduleId',s.id,'slotIndex',slot.slot_index,'morningParentId',slot.morning_parent_id,'afternoonParentId',slot.afternoon_parent_id)) FROM parenting_schedules s JOIN parenting_schedule_slots slot ON slot.schedule_id=s.id WHERE s.calendar_id=p.id AND s.active AND s.anchor_date<$3::date AND (s.end_date IS NULL OR s.end_date >= $2::date)),'[]') AS slots,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('scheduleId',s.id,'childId',sc.child_id)) FROM parenting_schedules s JOIN parenting_schedule_children sc ON sc.schedule_id=s.id JOIN children c ON c.id=sc.child_id AND c.calendar_id=p.id AND c.active WHERE s.calendar_id=p.id AND s.active AND s.anchor_date<$3::date AND (s.end_date IS NULL OR s.end_date >= $2::date)),'[]') AS "scheduleChildren"
 FROM permitted p WHERE p.calendar_type='co_parenting' AND p.participant_id IS NOT NULL`,
} as const;
