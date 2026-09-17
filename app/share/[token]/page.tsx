import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { and, asc, eq, gt, gte, isNull, lte, or } from "drizzle-orm";
import { CalendarDays, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  accessTokens,
  calendars,
  children,
  parentingAssignments,
  participants,
} from "@/lib/db/schema";
import { hashToken, looksLikeSecureToken } from "@/lib/security/tokens";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ month?: string }>;
};

type Ownership = string | "mixed";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthFromQuery(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return startOfMonth(new Date());
  const parsed = parseISO(`${value}-01`);
  return isValid(parsed) ? startOfMonth(parsed) : startOfMonth(new Date());
}

function styleForIndex(index: number) {
  return index % 2 === 0
    ? {
        cell: "border-emerald-200 bg-emerald-50",
        pill: "bg-emerald-100 text-emerald-800",
        dot: "bg-emerald-500",
      }
    : {
        cell: "border-violet-200 bg-violet-50",
        pill: "bg-violet-100 text-violet-800",
        dot: "bg-violet-500",
      };
}

export default async function SharedCalendarPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  if (!looksLikeSecureToken(token)) notFound();

  const db = getDb();
  const now = new Date();
  const tokenHash = hashToken(token);

  const accessRows = await db
    .select({
      tokenId: accessTokens.id,
      calendarId: calendars.id,
      calendarName: calendars.name,
      timezone: calendars.timezone,
    })
    .from(accessTokens)
    .innerJoin(calendars, eq(accessTokens.calendarId, calendars.id))
    .where(
      and(
        eq(accessTokens.tokenHash, tokenHash),
        eq(accessTokens.type, "viewer"),
        eq(calendars.shareEnabled, true),
        isNull(accessTokens.revokedAt),
        or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, now)),
      ),
    )
    .limit(1);

  const access = accessRows[0];
  if (!access) notFound();

  const currentMonth = monthFromQuery(query.month);
  const gridStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
  const from = format(gridStart, "yyyy-MM-dd");
  const to = format(gridEnd, "yyyy-MM-dd");

  const [parentRows, childRows, assignmentRows] = await db.batch([
    db
      .select({
        id: participants.id,
        displayName: participants.displayName,
      })
      .from(participants)
      .where(and(eq(participants.calendarId, access.calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db
      .select({ id: children.id })
      .from(children)
      .where(and(eq(children.calendarId, access.calendarId), eq(children.active, true))),
    db
      .select({
        date: parentingAssignments.assignmentDate,
        childId: parentingAssignments.childId,
        parentId: parentingAssignments.parentId,
        handoverTime: parentingAssignments.handoverTime,
        handoverLocation: parentingAssignments.handoverLocation,
        note: parentingAssignments.note,
      })
      .from(parentingAssignments)
      .where(
        and(
          eq(parentingAssignments.calendarId, access.calendarId),
          gte(parentingAssignments.assignmentDate, from),
          lte(parentingAssignments.assignmentDate, to),
        ),
      )
      .orderBy(asc(parentingAssignments.assignmentDate)),
  ]);

  await db
    .update(accessTokens)
    .set({ lastUsedAt: now })
    .where(eq(accessTokens.id, access.tokenId));

  const byDate = new Map<string, { parentIds: Set<string>; childIds: Set<string> }>();
  for (const assignment of assignmentRows) {
    const entry = byDate.get(assignment.date) ?? {
      parentIds: new Set<string>(),
      childIds: new Set<string>(),
    };
    entry.parentIds.add(assignment.parentId);
    entry.childIds.add(assignment.childId);
    byDate.set(assignment.date, entry);
  }

  const owners: Record<string, Ownership> = {};
  for (const [date, entry] of byDate) {
    owners[date] =
      entry.parentIds.size === 1 && entry.childIds.size === childRows.length
        ? [...entry.parentIds][0]
        : "mixed";
  }

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const previousMonth = format(subMonths(currentMonth, 1), "yyyy-MM");
  const nextMonth = format(addMonths(currentMonth, 1), "yyyy-MM");

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <Eye className="h-4 w-4" aria-hidden="true" />
            Read-only shared calendar
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {access.calendarName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            This link can view the schedule but cannot make changes.
          </p>
        </div>
        <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
          View only
        </span>
      </header>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-4 sm:px-5">
          <Link
            href={`/share/${token}?month=${previousMonth}`}
            aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs text-slate-500">
              {parentRows.slice(0, 2).map((parent, index) => (
                <span key={parent.id} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${styleForIndex(index).dot}`} />
                  {parent.displayName}
                </span>
              ))}
            </div>
          </div>
          <Link
            href={`/share/${token}?month=${nextMonth}`}
            aria-label="Next month"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        <div className="px-2 pb-2 pt-3 sm:px-4 sm:pb-4">
          <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={format(currentMonth, "MMMM yyyy")}>
            {weekdays.map((weekday) => (
              <div
                key={weekday}
                role="columnheader"
                className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs"
              >
                {weekday}
              </div>
            ))}

            {days.map((day) => {
              const date = format(day, "yyyy-MM-dd");
              const owner = owners[date];
              const parentIndex = owner === "mixed" ? -1 : parentRows.findIndex((parent) => parent.id === owner);
              const style = owner === "mixed"
                ? {
                    cell: "border-slate-300 bg-slate-100",
                    pill: "bg-slate-200 text-slate-700",
                    dot: "bg-slate-500",
                  }
                : parentIndex >= 0
                  ? styleForIndex(parentIndex)
                  : null;
              const parent = parentIndex >= 0 ? parentRows[parentIndex] : null;
              const inMonth = isSameMonth(day, currentMonth);

              return (
                <div
                  key={date}
                  role="gridcell"
                  aria-label={`${format(day, "EEEE d MMMM")}, ${owner === "mixed" ? "split between parents" : parent ? parent.displayName : "unassigned"}`}
                  className={`min-h-16 rounded-xl border p-1.5 sm:min-h-24 sm:rounded-2xl sm:p-2.5 ${
                    style?.cell ?? "border-slate-200 bg-white"
                  } ${inMonth ? "" : "opacity-30"}`}
                >
                  <span className="flex h-7 min-w-7 items-center justify-center text-sm font-semibold text-slate-700">
                    {format(day, "d")}
                  </span>
                  {owner && inMonth && style ? (
                    <div className={`mt-2 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold sm:text-xs ${style.pill}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                      <span className="truncate">{owner === "mixed" ? "Split" : parent?.displayName}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mx-auto mt-5 flex max-w-2xl items-center justify-center gap-2 text-center text-xs leading-5 text-slate-400">
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
        Schedule dates are shown in {access.timezone} calendar time.
      </div>
    </main>
  );
}
