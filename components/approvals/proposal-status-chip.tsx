import { proposalStatusLabel } from "@/lib/approvals/rules";
import type { ProposalStatus } from "@/lib/approvals/types";

const statusClasses: Record<ProposalStatus, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-700",
  declined: "border-rose-200 bg-rose-50 text-rose-700",
  withdrawn: "border-slate-200 bg-slate-50 text-slate-600",
  draft: "border-slate-200 bg-slate-50 text-slate-600",
};

export function ProposalStatusChip({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}
    >
      {proposalStatusLabel(status)}
    </span>
  );
}
