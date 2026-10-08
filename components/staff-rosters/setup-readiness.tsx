import Link from "next/link";
import { CovieStatusBadge } from "@/components/ui/covie";
import type { StaffSetupReadiness } from "@/lib/staff-rosters/setup-readiness";

export function StaffRosterSetupReadiness({ readiness }: { readiness: StaffSetupReadiness }) {
  return (
    <section aria-label="Roster setup and account access" className="mb-5 rounded-2xl border border-[#BFEDE6] bg-[#EAF8F5] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-[#243139]">Roster people and Covie access</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#526168]">
            Add a profile to plan their shifts. They can open their published roster in Covie after linking an account by accepting an invitation.
          </p>
        </div>
        <CovieStatusBadge tone={readiness.canPlanShifts ? "teal" : "neutral"}>
          {readiness.canPlanShifts ? "Ready to plan shifts" : "Add your first staff profile"}
        </CovieStatusBadge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Roster profiles", readiness.profileCount],
          ["Accounts linked", readiness.linkedAccountCount],
          ["Awaiting acceptance", readiness.awaitingAcceptanceCount],
          ["Profile only", readiness.profileOnlyCount],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl bg-white p-3">
            <dt className="text-xs font-bold text-[#526168]">{label}</dt>
            <dd className="mt-1 text-xl font-extrabold text-[#243139]">{count}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-[#526168]">Counts cover active staff and managers, excluding the owner.</p>
      <p className="mt-3 text-sm leading-6 text-[#526168]">
        {readiness.allAccountsLinked
          ? "Everyone on the team has a linked Covie account. Publish the roster when you want them to see their shifts."
          : "An invitation is not account access until it is accepted. Use each profile’s invite controls below when you want to connect them. You can plan shifts before anyone joins."}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#526168]">Locations and leave are optional and can be added later.</p>
        {readiness.canPlanShifts ? (
          <Link href="/calendar-types/staff-rosters" className="inline-flex min-h-11 items-center rounded-[10px] border border-[#BFEDE6] bg-white px-3 text-sm font-extrabold text-[#243139] hover:bg-[#FFF9F2]">
            Open roster
          </Link>
        ) : null}
      </div>
    </section>
  );
}
