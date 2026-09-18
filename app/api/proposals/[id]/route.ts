import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalEngineError,
  declineApprovalProposal,
  getApprovalProposalDetails,
  submitApprovalProposal,
  withdrawApprovalProposal,
} from "@/lib/approvals/engine";
import { acceptAndApplyApprovalProposal } from "@/lib/approvals/dispatch";
import { approvalActorFromSession } from "@/lib/approvals/http";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const proposalId = z.string().uuid();
const operationInput = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("submit"),
    approverMembershipId: z.string().uuid().nullable().optional(),
  }),
  z.object({ operation: z.literal("accept") }),
  z.object({
    operation: z.literal("decline"),
    declineReason: z
      .string()
      .trim()
      .max(500, "Keep the decline reason under 500 characters.")
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
  }),
  z.object({ operation: z.literal("withdraw") }),
]);

function approvalError(error: unknown) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: "The proposal could not be processed. Please refresh and try again." },
    { status: 500 },
  );
}

async function parseProposalId(context: RouteContext) {
  const params = await context.params;
  return proposalId.safeParse(params.id);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsedId = await parseProposalId(context);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Choose a valid proposal." }, { status: 400 });
  }

  const result = await getApprovalProposalDetails(session.calendarId, parsedId.data);
  if (!result) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsedId = await parseProposalId(context);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Choose a valid proposal." }, { status: 400 });
  }

  const parsed = operationInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a valid proposal action." },
      { status: 400 },
    );
  }

  const actor = approvalActorFromSession(session);

  try {
    if (parsed.data.operation === "submit") {
      return NextResponse.json(
        await submitApprovalProposal({
          calendarId: session.calendarId,
          actor,
          proposalId: parsedId.data,
          approverMembershipId: parsed.data.approverMembershipId,
        }),
      );
    }

    if (parsed.data.operation === "accept") {
      return NextResponse.json(
        await acceptAndApplyApprovalProposal({
          calendarId: session.calendarId,
          actor,
          proposalId: parsedId.data,
        }),
      );
    }

    if (parsed.data.operation === "decline") {
      return NextResponse.json(
        await declineApprovalProposal({
          calendarId: session.calendarId,
          actor,
          proposalId: parsedId.data,
          declineReason: parsed.data.declineReason,
        }),
      );
    }

    return NextResponse.json(
      await withdrawApprovalProposal({
        calendarId: session.calendarId,
        actor,
        proposalId: parsedId.data,
      }),
    );
  } catch (error) {
    return approvalError(error);
  }
}
