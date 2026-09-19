import { NextResponse } from "next/server";
import { listApprovalProposals } from "@/lib/approvals/engine";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const waiting = await listApprovalProposals(session.calendarId, {
    status: "waiting",
    limit: 100,
  });
  const count = waiting.filter(
    (proposal) => proposal.approverMembershipId === session.membershipId,
  ).length;

  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
