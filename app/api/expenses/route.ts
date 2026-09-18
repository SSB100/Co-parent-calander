import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createExpenseSchema,
  deleteExpenseSchema,
  editExpenseSchema,
  expenseDateQuerySchema,
} from "@/lib/expenses/contracts";
import {
  createExpense,
  deleteExpense,
  ExpenseServiceError,
  listExpenses,
  updateExpense,
} from "@/lib/expenses/service";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

function expenseServiceError(error: unknown) {
  if (error instanceof ExpenseServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: "The expense request could not be completed." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const rawDate = request.nextUrl.searchParams.get("date");
  const parsedDate = rawDate ? expenseDateQuerySchema.safeParse(rawDate) : null;
  if (rawDate && !parsedDate?.success) {
    return NextResponse.json(
      { error: "Choose a valid expense date." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await listExpenses({
      session,
      date: parsedDate?.success ? parsedDate.data : null,
    }),
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = createExpenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid expense details." },
      { status: 400 },
    );
  }

  const { reason, ...details } = parsed.data;
  try {
    const result = await createExpense({ session, details, reason });
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    return expenseServiceError(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = editExpenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid expense details." },
      { status: 400 },
    );
  }

  const { id, reason, ...details } = parsed.data;
  try {
    const result = await updateExpense({ session, id, details, reason });
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    return expenseServiceError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = deleteExpenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid expense." },
      { status: 400 },
    );
  }

  try {
    const result = await deleteExpense({
      session,
      id: parsed.data.id,
      reason: parsed.data.reason,
    });
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    return expenseServiceError(error);
  }
}
