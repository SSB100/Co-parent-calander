import { CovieStatusBadge } from "@/components/ui/covie";
import { proposalStatusLabel } from "@/lib/approvals/rules";
import type { ProposalStatus } from "@/lib/approvals/types";

const statusTones: Record<
  ProposalStatus,
  "teal" | "sunshine" | "danger" | "neutral"
> = {
  approved: "teal",
  waiting: "sunshine",
  declined: "danger",
  withdrawn: "neutral",
  draft: "neutral",
};

export function ProposalStatusChip({ status }: { status: ProposalStatus }) {
  return (
    <CovieStatusBadge tone={statusTones[status]}>
      {proposalStatusLabel(status)}
    </CovieStatusBadge>
  );
}
