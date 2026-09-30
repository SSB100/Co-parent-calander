import type { z } from "zod";
import { getSql } from "@/lib/db";
import { instantFromLocalDateTimeInTimeZone, localDateInTimeZone } from "@/lib/calendar/time";
import { getTemplateAccess, type TemplateSession } from "@/lib/calendar-sharing/access";
import type { SocialData, socialAvailabilitySchema, socialCancelSchema, socialEventSchema, socialRsvpSchema } from "./contracts";
export class SocialError extends Error { constructor(message:string,public status=400){super(message);} }
export function requireSocial(session:TemplateSession,write=false){if(session.calendarType!=="social_groups")throw new SocialError("Choose a Social Groups calendar.",403);if(write&&session.permission==="viewer")throw new SocialError("Ask the organiser for member access to take part.",403);}
async function accessFor(session:TemplateSession){requireSocial(session);const access=await getTemplateAccess(session);return{...access,admin:access.role==="owner"||access.role==="admin"};}
export async function loadSocial(session:TemplateSession,month?:string):Promise<SocialData>{
 const access=await accessFor(session),sql=getSql();const selected=month??localDateInTimeZone(session.calendarTimezone).slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected))throw new SocialError("Choose a valid month.");
 const first=`${selected}-01`,nextDate=new Date(`${first}T12:00:00Z`);nextDate.setUTCMonth(nextDate.getUTCMonth()+1);const next=nextDate.toISOString().slice(0,10);
 const start=instantFromLocalDateTimeInTimeZone(session.calendarTimezone,`${first}T00:00`).toISOString(),end=instantFromLocalDateTimeInTimeZone(session.calendarTimezone,`${next}T00:00`).toISOString();
 const [settings,events,availability,updates]=await Promise.all([
  sql`SELECT members_can_create AS "membersCanCreate" FROM social_settings WHERE calendar_id=${session.calendarId}`,
  sql`SELECT e.id,e.title,e.location,e.notes,e.start_at AS start,e.end_at AS "end",e.capacity,e.cancelled,e.version,
   e.created_by_user_id=${session.userId} AS own, (${access.admin} OR e.created_by_user_id=${session.userId}) AND ${session.permission!=="viewer"} AS "canEdit",
   (SELECT count(*)::int FROM social_rsvps r WHERE r.event_id=e.id AND r.response='going') AS going,
   (SELECT count(*)::int FROM social_rsvps r WHERE r.event_id=e.id AND r.response='maybe') AS maybe,
   (SELECT count(*)::int FROM social_rsvps r WHERE r.event_id=e.id AND r.response='declined') AS declined,
   (SELECT response FROM social_rsvps r WHERE r.event_id=e.id AND r.user_id=${session.userId}) AS "myResponse",
   COALESCE((SELECT jsonb_agg(jsonb_build_object('name',COALESCE(u.name,'Group member'),'response',r.response) ORDER BY r.updated_at) FROM social_rsvps r LEFT JOIN neon_auth."user" u ON u.id=r.user_id WHERE r.event_id=e.id),'[]'::jsonb) AS attendees
   FROM social_events e WHERE e.calendar_id=${session.calendarId} AND e.start_at<${end}::timestamptz AND e.end_at>${start}::timestamptz ORDER BY e.start_at`,
  sql`SELECT a.id,a.date::text,a.status,a.note,COALESCE(u.name,'Group member') AS name,a.user_id=${session.userId} AS own FROM social_availability a LEFT JOIN neon_auth."user" u ON u.id=a.user_id WHERE a.calendar_id=${session.calendarId} AND a.date>=${first}::date AND a.date<${next}::date ORDER BY a.date,a.updated_at`,
  sql`SELECT u.id,u.action,e.title AS "eventTitle",u.created_at AS "createdAt" FROM social_updates u JOIN social_events e ON e.id=u.event_id AND e.calendar_id=u.calendar_id WHERE u.calendar_id=${session.calendarId} ORDER BY u.created_at DESC LIMIT 100`,
 ]);
 const membersCanCreate=settings[0]?.membersCanCreate??true;
 return {calendarId:session.calendarId,role:access.role,canCreate:session.permission!=="viewer"&&(access.admin||membersCanCreate),canRespond:session.permission!=="viewer",canOrganise:access.admin,membersCanCreate,timezone:session.calendarTimezone,month:selected,events,availability,updates} as SocialData;
}
export async function saveSocialSettings(session:TemplateSession,membersCanCreate:boolean){requireSocial(session,true);const access=await accessFor(session);if(!access.admin)throw new SocialError("Only group organisers can change settings.",403);const sql=getSql();await sql`INSERT INTO social_settings(calendar_id,members_can_create) VALUES(${session.calendarId},${membersCanCreate}) ON CONFLICT(calendar_id) DO UPDATE SET members_can_create=EXCLUDED.members_can_create`;return{ok:true};}
export async function saveSocialEvent(session:TemplateSession,event:z.infer<typeof socialEventSchema>){
 requireSocial(session,true);const access=await accessFor(session);const sql=getSql();let start:string,end:string;
 try{start=instantFromLocalDateTimeInTimeZone(session.calendarTimezone,event.start).toISOString();end=instantFromLocalDateTimeInTimeZone(session.calendarTimezone,event.end).toISOString();}catch{throw new SocialError("That local time is not available. Choose another time.");}
 if(end<=start)throw new SocialError("End time must be after start time.");
 const rows=event.id?await sql`UPDATE social_events SET title=${event.title},location=${event.location},notes=${event.notes},start_at=${start},end_at=${end},capacity=${event.capacity},updated_by_user_id=${session.userId} WHERE id=${event.id} AND calendar_id=${session.calendarId} AND version=${event.version!} AND NOT cancelled AND (created_by_user_id=${session.userId} OR ${access.admin}) RETURNING id`:
 await sql`INSERT INTO social_events(calendar_id,created_by_user_id,updated_by_user_id,request_key,title,location,notes,start_at,end_at,capacity) VALUES(${session.calendarId},${session.userId},${session.userId},${event.requestId!},${event.title},${event.location},${event.notes},${start},${end},${event.capacity}) RETURNING id`;
 if(!rows.length)throw new SocialError("This event changed. Reload before trying again.",409);return{ok:true,id:rows[0].id as string};
}
export async function cancelSocialEvent(session:TemplateSession,event:z.infer<typeof socialCancelSchema>){requireSocial(session,true);const access=await accessFor(session);const sql=getSql();const rows=await sql`UPDATE social_events SET cancelled=true,updated_by_user_id=${session.userId} WHERE id=${event.id} AND calendar_id=${session.calendarId} AND version=${event.version} AND NOT cancelled AND (created_by_user_id=${session.userId} OR ${access.admin}) RETURNING id`;if(!rows.length)throw new SocialError("This event changed or is already cancelled. Reload the calendar.",409);return{ok:true};}
export async function respondToSocialEvent(session:TemplateSession,input:z.infer<typeof socialRsvpSchema>){
 requireSocial(session,true);const sql=getSql();await sql`INSERT INTO social_rsvps(calendar_id,event_id,user_id,response) VALUES(${session.calendarId},${input.eventId},${session.userId},${input.response}) ON CONFLICT(event_id,user_id) DO UPDATE SET response=EXCLUDED.response`;
 const conflicts=input.response==="going"?await sql`SELECT e.title FROM social_events e JOIN social_rsvps r ON r.event_id=e.id AND r.user_id=${session.userId} AND r.response='going' JOIN social_events target ON target.id=${input.eventId} AND target.calendar_id=${session.calendarId} WHERE e.calendar_id=${session.calendarId} AND e.id<>target.id AND NOT e.cancelled AND e.start_at<target.end_at AND target.start_at<e.end_at`:[];
 return{ok:true,warning:conflicts.length?`You’re also going to ${conflicts.map(e=>e.title).join(", ")} at this time. Your response is saved.`:null};
}
export async function saveSocialAvailability(session:TemplateSession,input:z.infer<typeof socialAvailabilitySchema>){requireSocial(session,true);const sql=getSql();if(input.date<localDateInTimeZone(session.calendarTimezone))throw new SocialError("Choose today or a future date.");await sql`INSERT INTO social_availability(calendar_id,user_id,date,status,note) VALUES(${session.calendarId},${session.userId},${input.date},${input.status},${input.note}) ON CONFLICT(calendar_id,user_id,date) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,updated_at=now()`;return{ok:true};}
