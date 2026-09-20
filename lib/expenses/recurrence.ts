import { randomUUID } from "node:crypto";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import { asc, eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  expenseRecurringSeries,
  expenseRecurringSeriesShares,
} from "@/lib/db/schema";
import type {
  ExpenseDetails,
  ExpenseRecurrence,
} from "@/lib/expenses/model";

const dateFormat = "yyyy-MM-dd";

function recurringDate(
  startDate: string,
  frequency: ExpenseRecurrence["frequency"],
  index: number,
) {
  const start = parseISO(startDate);
  switch (frequency) {
    case "weekly":
      return format(addWeeks(start, index), dateFormat);
    case "fortnightly":
      return format(addWeeks(start, index * 2), dateFormat);
    case "monthly":
      return format(addMonths(start, index), dateFormat);
    case "yearly":
      return format(addYears(start, index), dateFormat);
  }
}

export function recurringExpenseDates(input: {
  startDate: string;
  lastGeneratedDate: string;
  frequency: ExpenseRecurrence["frequency"];
  endDate: string | null;
  throughDate: string;
}) {
  const limit =
    input.endDate && input.endDate < input.throughDate
      ? input.endDate
      : input.throughDate;
  if (limit <= input.lastGeneratedDate) return [];

  const dates: string[] = [];
  for (let index = 1; index <= 600; index += 1) {
    const candidate = recurringDate(input.startDate, input.frequency, index);
    if (candidate <= input.lastGeneratedDate) continue;
    if (candidate > limit) break;
    dates.push(candidate);
  }
  return dates;
}

function occurrenceDueDate(
  occurrenceDate: string,
  dueOffsetDays: number | null,
) {
  return dueOffsetDays === null
    ? null
    : format(addDays(parseISO(occurrenceDate), dueOffsetDays), dateFormat);
}

export function initialRecurringExpenseHorizon(startDate: string) {
  return format(addMonths(parseISO(startDate), 12), dateFormat);
}

export async function createRecurringExpenseSeries(input: {
  calendarId: string;
  createdByParticipantId: string;
  firstExpenseId: string;
  details: ExpenseDetails;
  recurrence: ExpenseRecurrence;
}) {
  const seriesId = randomUUID();
  const dueOffsetDays = input.details.dueDate
    ? differenceInCalendarDays(
        parseISO(input.details.dueDate),
        parseISO(input.details.expenseDate),
      )
    : null;
  const sql = getSql();

  await sql.transaction([
    sql`
      INSERT INTO expense_recurring_series (
        id,
        calendar_id,
        child_id,
        title,
        category,
        amount_cents,
        paid_by_participant_id,
        start_date,
        due_offset_days,
        frequency,
        end_date,
        last_generated_date,
        note,
        active,
        created_by,
        updated_at
      )
      VALUES (
        ${seriesId},
        ${input.calendarId},
        ${input.details.childId},
        ${input.details.title},
        ${input.details.category},
        ${input.details.amountCents},
        ${input.details.paidByParticipantId},
        ${input.details.expenseDate},
        ${dueOffsetDays},
        ${input.recurrence.frequency}::expense_recurrence_frequency,
        ${input.recurrence.endDate},
        ${input.details.expenseDate},
        ${input.details.note},
        true,
        ${input.createdByParticipantId},
        now()
      )
    `,
    ...input.details.shares.map((share) => sql`
      INSERT INTO expense_recurring_series_shares (
        series_id,
        participant_id,
        share_cents
      )
      VALUES (
        ${seriesId},
        ${share.participantId},
        ${share.shareCents}
      )
    `),
    sql`
      INSERT INTO expenses (
        id,
        calendar_id,
        child_id,
        expense_date,
        title,
        category,
        amount_cents,
        paid_by_participant_id,
        due_date,
        note,
        series_id,
        series_occurrence_date,
        settlement_status,
        created_by,
        updated_at
      )
      VALUES (
        ${input.firstExpenseId},
        ${input.calendarId},
        ${input.details.childId},
        ${input.details.expenseDate},
        ${input.details.title},
        ${input.details.category},
        ${input.details.amountCents},
        ${input.details.paidByParticipantId},
        ${input.details.dueDate},
        ${input.details.note},
        ${seriesId},
        ${input.details.expenseDate},
        'outstanding',
        ${input.createdByParticipantId},
        now()
      )
    `,
    ...input.details.shares.map((share) => sql`
      INSERT INTO expense_shares (
        expense_id,
        participant_id,
        share_cents
      )
      VALUES (
        ${input.firstExpenseId},
        ${share.participantId},
        ${share.shareCents}
      )
    `),
    sql`
      INSERT INTO audit_log (
        calendar_id,
        actor_participant_id,
        action,
        entity_type,
        entity_id,
        after_state
      )
      VALUES (
        ${input.calendarId},
        ${input.createdByParticipantId},
        'expense.create',
        'expense',
        ${input.firstExpenseId},
        ${JSON.stringify({
          ...input.details,
          recurrence: input.recurrence,
          seriesId,
          settlementStatus: "outstanding",
        })}::jsonb
      )
    `,
  ]);

  try {
    await materializeRecurringExpenseSeries({
      seriesId,
      throughDate: initialRecurringExpenseHorizon(input.details.expenseDate),
    });
  } catch (error) {
    console.error("Recurring Shared Costs initial materialization failed", {
      seriesId,
      message: error instanceof Error ? error.message : "unknown error",
    });
  }

  return { seriesId, firstExpenseId: input.firstExpenseId };
}

export async function materializeRecurringExpenseSeries(input: {
  seriesId: string;
  throughDate: string;
}) {
  const db = getDb();
  const seriesRows = await db
    .select({
      id: expenseRecurringSeries.id,
      calendarId: expenseRecurringSeries.calendarId,
      childId: expenseRecurringSeries.childId,
      title: expenseRecurringSeries.title,
      category: expenseRecurringSeries.category,
      amountCents: expenseRecurringSeries.amountCents,
      paidByParticipantId: expenseRecurringSeries.paidByParticipantId,
      startDate: expenseRecurringSeries.startDate,
      dueOffsetDays: expenseRecurringSeries.dueOffsetDays,
      frequency: expenseRecurringSeries.frequency,
      endDate: expenseRecurringSeries.endDate,
      lastGeneratedDate: expenseRecurringSeries.lastGeneratedDate,
      note: expenseRecurringSeries.note,
      active: expenseRecurringSeries.active,
      createdBy: expenseRecurringSeries.createdBy,
    })
    .from(expenseRecurringSeries)
    .where(eq(expenseRecurringSeries.id, input.seriesId))
    .limit(1);

  const series = seriesRows[0];
  if (!series?.active) return { created: 0 };

  const shares = await db
    .select({
      participantId: expenseRecurringSeriesShares.participantId,
      shareCents: expenseRecurringSeriesShares.shareCents,
    })
    .from(expenseRecurringSeriesShares)
    .where(eq(expenseRecurringSeriesShares.seriesId, series.id))
    .orderBy(asc(expenseRecurringSeriesShares.createdAt));

  const dates = recurringExpenseDates({
    startDate: series.startDate,
    lastGeneratedDate: series.lastGeneratedDate,
    frequency: series.frequency,
    endDate: series.endDate,
    throughDate: input.throughDate,
  });
  if (dates.length === 0) return { created: 0 };

  const sql = getSql();
  const statements = [];

  for (const occurrenceDate of dates) {
    const expenseId = randomUUID();
    const dueDate = occurrenceDueDate(
      occurrenceDate,
      series.dueOffsetDays,
    );

    statements.push(sql`
      INSERT INTO expenses (
        id,
        calendar_id,
        child_id,
        expense_date,
        title,
        category,
        amount_cents,
        paid_by_participant_id,
        due_date,
        note,
        series_id,
        series_occurrence_date,
        settlement_status,
        created_by,
        updated_at
      )
      VALUES (
        ${expenseId},
        ${series.calendarId},
        ${series.childId},
        ${occurrenceDate},
        ${series.title},
        ${series.category},
        ${series.amountCents},
        ${series.paidByParticipantId},
        ${dueDate},
        ${series.note},
        ${series.id},
        ${occurrenceDate},
        'outstanding',
        ${series.createdBy},
        now()
      )
      ON CONFLICT ("series_id", "series_occurrence_date")
      WHERE "series_id" IS NOT NULL
      DO NOTHING
    `);

    for (const share of shares) {
      statements.push(sql`
        INSERT INTO expense_shares (
          expense_id,
          participant_id,
          share_cents
        )
        SELECT
          expense.id,
          ${share.participantId},
          ${share.shareCents}
        FROM expenses expense
        WHERE expense.series_id = ${series.id}
          AND expense.series_occurrence_date = ${occurrenceDate}
        ON CONFLICT ("expense_id", "participant_id") DO NOTHING
      `);
    }
  }

  const lastGeneratedDate = dates[dates.length - 1];
  statements.push(sql`
    UPDATE expense_recurring_series
    SET
      last_generated_date = ${lastGeneratedDate},
      updated_at = now()
    WHERE id = ${series.id}
      AND last_generated_date < ${lastGeneratedDate}
  `);

  await sql.transaction(statements);
  return { created: dates.length };
}

export async function materializeActiveRecurringExpenses(input?: {
  monthsAhead?: number;
}) {
  const monthsAhead = input?.monthsAhead ?? 12;
  const today = format(new Date(), dateFormat);
  const throughDate = format(addMonths(parseISO(today), monthsAhead), dateFormat);
  const rows = await getDb()
    .select({
      id: expenseRecurringSeries.id,
    })
    .from(expenseRecurringSeries)
    .where(eq(expenseRecurringSeries.active, true));

  let created = 0;
  for (const row of rows) {
    const result = await materializeRecurringExpenseSeries({
      seriesId: row.id,
      throughDate,
    });
    created += result.created;
  }

  return { seriesCount: rows.length, created, throughDate };
}
