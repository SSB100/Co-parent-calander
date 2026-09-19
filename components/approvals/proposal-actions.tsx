"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

type ProposalActionsProps = {
  proposalId: string;
  currentMembershipId: string;
  proposedByMembershipId: string;
  approverMembershipId: string | null;
  onChanged: () => void;
};

export function ProposalActions({
  proposalId,
  currentMembershipId,
  proposedByMembershipId,
  approverMembershipId,
  onChanged,
}: ProposalActionsProps) {
  const [busy, setBusy] = useState<"accept" | "decline" | "withdraw" | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canRespond = approverMembershipId === currentMembershipId;
  const canWithdraw = proposedByMembershipId === currentMembershipId;

  async function run(
    operation: "accept" | "decline" | "withdraw",
  ) {
    if (busy) return;
    setBusy(operation);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          operation === "decline"
            ? {
                operation,
                declineReason: declineReason.trim() || null,
              }
            : { operation },
        ),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "That proposal could not be updated.");
      }

      onChanged();
      window.dispatchEvent(new Event("covie-records-updated"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That proposal could not be updated.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!canRespond && !canWithdraw) return null;

  return (
    <div className="w-full space-y-2">
      {canRespond ? (
        <>
          <input
            type="text"
            maxLength={500}
            value={declineReason}
            disabled={Boolean(busy)}
            placeholder="Decline reason (optional)"
            onChange={(event) => setDeclineReason(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run("accept")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy === "accept" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Accept
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run("decline")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {busy === "decline" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Decline
            </button>
          </div>
        </>
      ) : null}

      {canWithdraw ? (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void run("withdraw")}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy === "withdraw" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Withdraw proposal
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
