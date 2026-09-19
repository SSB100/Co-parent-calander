import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalEngineError,
  createApprovalProposal,
  listApprovalProposals,
} from "@/lib/approvals/engine";
import type { ApprovalActor } from "@/lib/approvals/types";
import { sendApprovalEmail } from "@/lib/email/approval-notifications";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

const proposalStatus = z.enum(["draft", "waiting", "approved", "declined", "withdrawn"]);

const proposalInput = z
  .object({
    entityType: z
      .string()
      .trim()
      .min(1, "Choose what this proposal changes.")
      .max(64, "The proposal type is too long.")
      .regex(/^[a-z0-9_.-]+$/i, "Choose a valid proposal type."),
    entityId: z
      .string()
      .trim()
      .min(1, "Choose the item this proposal changes.")
      .max(255, "The proposal item identifier is too long."),
    action: z.enum(["create", "edit", "delete"]),
    previousState: z.unknown().nullable().optional(),
    proposedState: z.unknown().nullable().optional(),
    reason: z
      .string()
      .trim()
      .max(500, "Keep the reason under 500 characters.")
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
    approverMembershipId: z.string().uuid().nullable().optional(),
    saveAsDraft: z.boolean().optional().default(false),
  })
  .superRefine((value, context) => {
    if (value.action === "create" && value.proposedState == null) {
      context.addIssue({
        code: "custom",
        path: ["proposedState"],
        message: "Add the proposed details before sending this change.",
      });
    }
    if (value.action === "edit" && (value.previousState == null || value.proposedState == null)) {
      context.addIssue({
        code: "custom",
        path: ["proposedState"],
        message: "Editing a shared item needs both the agreed and proposed versions.",
      });
    }
    if (value.action === "delete" && value.previousState == null) {
      context.addIssue({
        code: "custom",
        path: ["previousState"],
        message: "Deleting a shared item needs the current agreed version.",
      });
    }
  });

function actorFromSession(session: {
  membershipId: string;
  participantId: string | null;
  permission: "owner" | "editor" | "viewer";
}): ApprovalActor {
  return {
    membershipId: session.membershipId,
    participantId: session.participantId,
    permission: session.permission,
  };
}

function approvalError(error: unknown) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: "The proposal could not be processed. Please refresh and try again." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const statusValue = request.nextUrl.searchParams.get("status");
  const parsedStatus = statusValue ? proposalStatus.safeParse(statusValue) : null;
  if (statusValue && !parsedStatus?.success) {
    return NextResponse.json({ error: "Choose a valid proposal status." }, { status: 400 });
  }

  const entityType = request.nextUrl.searchParams.get("entityType")?.trim() || undefined;
  const entityId = request.nextUrl.searchParams.get("entityId")?.trim() || undefined;
  if ((entityType?.length ?? 0) > 64 || (entityId?.length ?? 0) > 255) {
    return NextResponse.json({ error: "The proposal filter is too long." }, { status: 400 });
  }

  const proposals = await listApprovalProposals(session.calendarId, {
    status: parsedStatus?.success ? parsedStatus.data : undefined,
    entityType,
    entityId,
  });

  return NextResponse.json({ proposals });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsed = proposalInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid proposal details." },
      { status: 400 },
    );
  }

  try {
    const result = await createApprovalProposal({
      calendarId: session.calendarId,
      actor: actorFromSession(session),
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      action: parsed.data.action,
      previousState: parsed.data.previousState ?? null,
      proposedState: parsed.data.proposedState ?? null,
      reason: parsed.data.reason,
      approverMembershipId: parsed.data.approverMembershipId,
      saveAsDraft: parsed.data.saveAsDraft,
    });

    if (result?.proposal.status === "waiting") {
      await sendApprovalEmail({
        calendarId: session.calendarId,
        membershipId: result.proposal.approverMembershipId,
        kind: "approval_requested",
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return approvalError(error);
  }
}
