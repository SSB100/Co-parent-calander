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
  changeDetails?: Array<{
    label: string;
    before: string | null;
    after: string | null;
  }>;
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
  changeDetails,
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

      {changeDetails && changeDetails.length > 0 ? (
        <details className="mt-3 rounded-xl border border-[#C9BDF1] bg-[#F6F2FF]">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-[#544394] marker:hidden">
            View change details
            <span className="ml-1 text-xs font-semibold text-slate-500">
              ({changeDetails.length})
            </span>
          </summary>
          <div className="border-t border-[#C9BDF1] px-3 py-3">
            <div className="hidden grid-cols-[minmax(110px,0.8fr)_1fr_1fr] gap-2 border-b border-[#DDD3FA] pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
              <span>Changed field</span>
              <span>Before</span>
              <span>Proposed</span>
            </div>
            <div className="divide-y divide-[#E7E0F7]">
              {changeDetails.map((detail, index) => (
                <div
                  key={`${detail.label}-${index}`}
                  className="grid gap-1 py-2.5 sm:grid-cols-[minmax(110px,0.8fr)_1fr_1fr] sm:gap-2"
                >
                  <p className="text-xs font-bold text-slate-700">{detail.label}</p>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">
                      Before
                    </p>
                    <p className="break-words text-sm text-slate-600">
                      {detail.before ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#8A6E0B] sm:hidden">
                      Proposed
                    </p>
                    <p className="break-words text-sm font-semibold text-slate-900">
                      {detail.after ?? "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      ) : null}

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
