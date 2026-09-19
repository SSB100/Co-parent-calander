import type { ReactNode } from "react";
import type { ProposalStatus } from "@/lib/approvals/types";
import { ProposalStatusChip } from "@/components/approvals/proposal-status-chip";

type ProposalCardProps = {
  status: ProposalStatus;
  title?: string;
  proposedByName?: string | null;
  approverName?: string | null;
  reason?: string | null;
  declineReason?: string | null;
  agreedSummary?: ReactNode;
  proposedSummary?: ReactNode;
  actions?: ReactNode;
};

export function ProposalCard({
  status,
  title = "Shared change",
  proposedByName,
  approverName,
  reason,
  declineReason,
  agreedSummary,
  proposedSummary,
  actions,
}: ProposalCardProps) {
  const statusMessage =
    status === "waiting" && approverName
      ? `Waiting for ${approverName}`
      : status === "approved"
        ? "Agreed"
        : status === "declined"
          ? "Declined"
          : status === "withdrawn"
            ? "Withdrawn"
            : "Draft";

  return (
    <section className="rounded-2xl border-2 border-[#243139] bg-white p-4 shadow-[5px_5px_0_#FF6B5F22]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {proposedByName ? `Proposed by ${proposedByName} · ` : ""}
            {statusMessage}
          </p>
        </div>
        <ProposalStatusChip status={status} />
      </div>

      {(agreedSummary || proposedSummary) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {agreedSummary && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Agreed
              </p>
              <div className="mt-1 text-sm text-slate-800">{agreedSummary}</div>
            </div>
          )}
          {proposedSummary && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Proposed
              </p>
              <div className="mt-1 text-sm text-slate-800">{proposedSummary}</div>
            </div>
          )}
        </div>
      )}

      {reason && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600">Reason</p>
          <p className="mt-1 text-sm text-slate-700">{reason}</p>
        </div>
      )}

      {declineReason && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600">Decline reason</p>
          <p className="mt-1 text-sm text-slate-700">{declineReason}</p>
        </div>
      )}

      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}
