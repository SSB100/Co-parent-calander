import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCalendarSession } from "@/lib/security/session";
import { matchesExpectedCalendar } from "@/lib/calendar-sharing/policy";
import { isSameOriginMutation } from "@/lib/security/request";
import { changeTemplateMember, createTemplateInvite, loadTemplateMembers, revokeTemplateInvite, SharingError } from "@/lib/calendar-sharing/service";
function errorResponse(error:unknown){return NextResponse.json({error:error instanceof SharingError?error.message:"Members could not be updated. Please try again."},{status:error instanceof SharingError?error.status:500});}
export async function GET(){const session=await getCalendarSession();if(!session)return NextResponse.json({error:"Calendar access is required."},{status:401});try{return NextResponse.json(await loadTemplateMembers(session));}catch(error){return errorResponse(error);}}
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("invite"),role:z.enum(["manager","admin","member","viewer"]),resourceIds:z.array(z.string().uuid()).max(100).default([])}),
  z.object({action:z.literal("revoke"),id:z.string().uuid()}),
  z.object({action:z.literal("role"),id:z.string().uuid(),role:z.enum(["manager","admin","member","viewer"]),resourceIds:z.array(z.string().uuid()).max(100).default([])}),
]);
export async function POST(request:NextRequest){
  if(!isSameOriginMutation(request))return NextResponse.json({error:"This request was blocked for safety."},{status:403});
  const session=await getCalendarSession();if(!session)return NextResponse.json({error:"Calendar access is required."},{status:401});
  if (!matchesExpectedCalendar(request.headers.get("x-covie-calendar-id"), session.calendarId)) return NextResponse.json({ error: "Your selected calendar changed. Reload this page before saving." }, { status: 409 });
  const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Check the invitation details."},{status:400});
  try{const value=parsed.data;return NextResponse.json(value.action==="invite"?await createTemplateInvite(session,value.role,value.resourceIds):value.action==="revoke"?await revokeTemplateInvite(session,value.id):await changeTemplateMember(session,value.id,value.role,value.resourceIds));}catch(error){return errorResponse(error);}
}
