import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const expenseId = z.string().uuid();
const inputSchema = z.object({
  operation: z.enum(["settle", "reopen"]),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const params = await context.params;
  const parsedId = expenseId.safeParse(params.id);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsedId.success || !parsed.success) {
    return NextResponse.json({ error: "Choose a valid settlement update." }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: expenses.id,
      settlementStatus: expenses.settlementStatus,
      amountCents: expenses.amountCents,
      paidByParticipantId: expenses.paidByParticipantId,
    })
    .from(expenses)
    .where(and(eq(expenses.id, parsedId.data), eq(expenses.calendarId, session.calendarId)))
    .limit(1);

  const expense = rows[0];
  if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  if (expense.settlementStatus === "not_needed") {
    return NextResponse.json(
      { error: "This expense does not have a reimbursement to settle." },
      { status: 409 },
    );
  }

  const nextStatus = parsed.data.operation === "settle" ? "settled" : "outstanding";
  if (expense.settlementStatus === nextStatus) {
    return NextResponse.json({ ok: true, settlementStatus: nextStatus });
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        UPDATE expenses
        SET
          settlement_status = ${nextStatus}::expense_settlement_status,
          settled_at = ${nextStatus === "settled" ? new Date() : null},
          settled_by_participant_id = ${nextStatus === "settled" ? session.participantId : null},
          updated_at = now()
        WHERE id = ${parsedId.data}
          AND calendar_id = ${session.calendarId}
          AND settlement_status <> 'not_needed'
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          before_state, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId}, 'expense.settlement.update',
          'expense', ${parsedId.data},
          ${JSON.stringify({ settlementStatus: expense.settlementStatus })}::jsonb,
          ${JSON.stringify({ settlementStatus: nextStatus })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The settlement status could not be updated." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, settlementStatus: nextStatus });
}
