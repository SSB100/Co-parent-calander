import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCalendarSession } from "@/lib/security/session";
import { getDb } from "@/lib/db";
import { calendars, expenses, responsibilities } from "@/lib/db/schema";
import { comingUp } from "@/lib/workspace/coming-up";
export async function GET() {
 const session = await getCalendarSession();
 if (!session) return NextResponse.json({error:"Calendar access is required."},{status:401});
 try {
  const db=getDb();
  const [calendar, costs, tasks]=await Promise.all([
   db.select({timezone:calendars.timezone}).from(calendars).where(eq(calendars.id,session.calendarId)).limit(1),
   db.select({id:expenses.id,title:expenses.title,dueDate:expenses.dueDate,settlementStatus:expenses.settlementStatus}).from(expenses).where(eq(expenses.calendarId,session.calendarId)),
   db.select({id:responsibilities.id,title:responsibilities.title,dueDate:responsibilities.dueDate,completedAt:responsibilities.completedAt}).from(responsibilities).where(eq(responsibilities.calendarId,session.calendarId))
  ]);
  if (!calendar[0]) return NextResponse.json({error:"Calendar unavailable."},{status:404});
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:calendar[0].timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return NextResponse.json(comingUp(costs,tasks,part('year')+'-'+part('month')+'-'+part('day')),{headers:{'Cache-Control':'private, no-store'}});
 } catch { return NextResponse.json({error:"Coming up is unavailable."},{status:500}); }
}
