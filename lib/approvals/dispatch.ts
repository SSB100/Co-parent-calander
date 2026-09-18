import { acceptCalendarApprovalProposal } from "@/lib/approvals/calendar-apply";
import { acceptExpenseApprovalProposal } from "@/lib/approvals/expense-apply";
import { acceptApprovalProposal } from "@/lib/approvals/engine";
import { acceptResponsibilityApprovalProposal } from "@/lib/approvals/responsibility-apply";
import type { ApprovalActor } from "@/lib/approvals/types";
import { kickGoogleCalendarSync } from "@/lib/google-calendar/dispatch";

export async function acceptAndApplyApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
}) {
  const responsibilityApplied =
    await acceptResponsibilityApprovalProposal(input);

  const expenseApplied =
    responsibilityApplied ??
    (await acceptExpenseApprovalProposal(input));

  const featureApplied =
    expenseApplied ??
    (await acceptCalendarApprovalProposal(input));

  if (featureApplied) {
    if (featureApplied.googleSyncQueued) {
      kickGoogleCalendarSync(input.calendarId);
    }
    return featureApplied.details;
  }

  return acceptApprovalProposal(input);
}
