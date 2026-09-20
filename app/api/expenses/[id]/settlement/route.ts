import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  expenseIdSchema,
  settlementUpdateSchema,
} from "@/lib/expenses/contracts";
import {
  ExpenseServiceError,
  updateExpenseSettlement,
} from "@/lib/expenses/service";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function expenseServiceError(error: unknown) {
  if (error instanceof ExpenseServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: "The settlement request could not be completed." },
    { status: 500 },
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

  const params = await context.params;
  const parsedId = expenseIdSchema.safeParse(params.id);
  const parsed = settlementUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedId.success || !parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid payment amount." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await updateExpenseSettlement({
        session,
        id: parsedId.data,
        paymentCents: parsed.data.paymentCents,
      }),
    );
  } catch (error) {
    return expenseServiceError(error);
  }
}
