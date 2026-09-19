import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ListChecks,
} from "lucide-react";

const days = [
  { day: "1", owner: "alex" },
  { day: "2", owner: "alex", event: "School show" },
  { day: "3", owner: "split" },
  { day: "4", owner: "sam" },
  { day: "5", owner: "sam" },
  { day: "6", owner: "sam" },
  { day: "7", owner: "alex" },
  { day: "8", owner: "alex" },
  { day: "9", owner: "alex" },
  { day: "10", owner: "splitReverse", event: "Handover" },
  { day: "11", owner: "sam" },
  { day: "12", owner: "sam" },
  { day: "13", owner: "alex", event: "Football" },
  { day: "14", owner: "alex" },
];

function ownerClass(owner: string) {
  if (owner === "alex") return "bg-[#BFEDE6]";
  if (owner === "sam") return "bg-[#DDD3FA]";
  return "bg-white";
}

export function CalendarProductPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[8px_8px_0_#243139]">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 sm:px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <ChevronLeft className="h-4 w-4" />
        </span>
        <strong className="text-sm text-slate-900 sm:text-base">September 2026</strong>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
      <div className="p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-semibold text-slate-500 sm:text-[10px]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((item) => {
            const split = item.owner === "split" || item.owner === "splitReverse";
            return (
              <div
                key={item.day}
                className={`relative min-h-14 overflow-hidden rounded-md border border-slate-200 ${ownerClass(item.owner)} sm:min-h-16`}
              >
                {split ? (
                  <div className="absolute inset-0 flex">
                    <div className={`w-1/2 ${item.owner === "split" ? "bg-[#BFEDE6]" : "bg-[#DDD3FA]"}`} />
                    <div className={`w-1/2 ${item.owner === "split" ? "bg-[#DDD3FA]" : "bg-[#BFEDE6]"}`} />
                  </div>
                ) : null}
                {item.owner === "alex" ? (
                  <span className="absolute inset-x-1 top-1 z-10 truncate text-center text-[7px] font-bold text-slate-800 sm:text-[9px]">Alex</span>
                ) : item.owner === "sam" ? (
                  <span className="absolute inset-x-1 top-1 z-10 truncate text-center text-[7px] font-bold text-slate-800 sm:text-[9px]">Sam</span>
                ) : (
                  <>
                    <span className="absolute left-0 top-1 z-10 w-1/2 truncate text-center text-[6px] font-bold text-slate-800 sm:text-[8px]">
                      {item.owner === "split" ? "Alex" : "Sam"}
                    </span>
                    <span className="absolute right-0 top-1 z-10 w-1/2 truncate text-center text-[6px] font-bold text-slate-800 sm:text-[8px]">
                      {item.owner === "split" ? "Sam" : "Alex"}
                    </span>
                  </>
                )}
                <span className="absolute right-1 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[9px] font-bold text-slate-700 shadow-sm">
                  {item.day}
                </span>
                {item.event ? (
                  <span className="absolute inset-x-0 bottom-0 z-20 flex h-4 items-center truncate bg-[#F4C64E] px-1 text-[6px] font-bold text-[#243139] sm:h-5 sm:text-[8px]">
                    {item.event === "Handover" ? <Clock3 className="mr-0.5 h-2.5 w-2.5 shrink-0" /> : null}
                    {item.event}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {!compact ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#19A897]" />Alex</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#765ED6]" />Sam</span>
            <span className="ml-auto flex items-center gap-1 font-semibold text-slate-700"><CalendarDays className="h-3 w-3" /> Select a day for details</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function UpdatesProductPreview() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[7px_7px_0_#FF6B5F]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold text-slate-950">Updates</h4>
          <p className="mt-1 text-xs text-slate-500">Saturday 19 September</p>
        </div>
        <span className="workspace-notification-badge" style={{ position: "static" }}>2</span>
      </div>
      <div className="mt-4 space-y-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-4 w-4 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Calendar change waiting for you</p>
              <p className="mt-1 text-xs text-slate-600">Swap Saturday 26th for Sunday 27th.</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Football registration</p>
              <p className="mt-1 text-xs text-slate-600">Assigned to Alex · due Friday</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExpenseProductPreview() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[7px_7px_0_#F4C64E]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <CircleDollarSign className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-950">Football fees</p>
          <p className="mt-0.5 text-xs text-slate-500">Paid by Alex · 50/50 split</p>
        </div>
        <strong className="text-lg text-slate-950">$48.00</strong>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
        <span className="text-slate-600">Reimbursement</span>
        <span className="font-semibold text-amber-800">Outstanding</span>
      </div>
    </div>
  );
}

export function ResponsibilityProductPreview() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[7px_7px_0_#19A897]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
          <ListChecks className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-950">Return school form</p>
          <p className="mt-1 text-xs text-slate-500">Alex · due Monday</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">Due soon</span>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
        Linked to the family calendar so it stays visible with the week.
      </div>
    </div>
  );
}
