import { getSql } from "@/lib/db";

export type ApprovalEmailKind =
  | "approval_requested"
  | "approval_approved"
  | "approval_declined"
  | "approval_withdrawn";

type RecipientRow = {
  email: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://covie.app").replace(/\/$/, "");
}

function emailCopy(kind: ApprovalEmailKind) {
  if (kind === "approval_requested") {
    return {
      subject: "A Covie change is waiting for you",
      heading: "A change is waiting for your approval",
      body: "A co-parenting change has been sent to you in Covie. Open Updates to review, approve or decline it.",
      action: "Review in Covie",
    };
  }
  if (kind === "approval_approved") {
    return {
      subject: "Your Covie change was approved",
      heading: "Your change was approved",
      body: "A change you proposed in Covie has been approved. Open Updates to see the latest shared plan.",
      action: "Open Covie",
    };
  }
  if (kind === "approval_declined") {
    return {
      subject: "Your Covie change was declined",
      heading: "Your change was declined",
      body: "A change you proposed in Covie was declined. Open Updates to review the current shared plan.",
      action: "Open Covie",
    };
  }
  return {
    subject: "A Covie approval request was withdrawn",
    heading: "An approval request was withdrawn",
    body: "A Covie change that was waiting for your response has been withdrawn by the person who proposed it.",
    action: "Open Covie",
  };
}

async function recipientEmail(input: {
  calendarId: string;
  membershipId: string;
}) {
  const sql = getSql();
  const rows = (await sql`
    SELECT auth_user.email
    FROM calendar_memberships membership
    JOIN neon_auth."user" auth_user
      ON auth_user.id = membership.user_id
    WHERE membership.id = ${input.membershipId}
      AND membership.calendar_id = ${input.calendarId}
    LIMIT 1
  `) as RecipientRow[];

  return rows[0]?.email?.trim() || null;
}

export function approvalEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendApprovalEmail(input: {
  calendarId: string;
  membershipId: string | null | undefined;
  kind: ApprovalEmailKind;
}) {
  if (!input.membershipId || !approvalEmailConfigured()) {
    return { sent: false as const, reason: "not_configured_or_missing_recipient" };
  }

  const to = await recipientEmail({
    calendarId: input.calendarId,
    membershipId: input.membershipId,
  }).catch(() => null);

  if (!to) {
    return { sent: false as const, reason: "recipient_not_found" };
  }

  const copy = emailCopy(input.kind);
  const updatesUrl = `${appUrl()}/home`;
  const from = process.env.EMAIL_FROM!;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: copy.subject,
      text: `${copy.heading}\n\n${copy.body}\n\n${copy.action}: ${updatesUrl}\n\nCovie keeps the details inside your private account rather than copying them into email.`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;background:#FFF9F2;padding:24px;color:#243139">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:2px solid #243139;border-radius:16px;overflow:hidden">
            <div style="height:8px;background:#FF6B5F"></div>
            <div style="padding:24px">
              <div style="font-size:26px;font-weight:700;margin-bottom:18px">Covie</div>
              <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${copy.heading}</h1>
              <p style="font-size:15px;line-height:1.6;color:#526168;margin:0 0 22px">${copy.body}</p>
              <a href="${updatesUrl}" style="display:inline-block;background:#FF6B5F;color:#243139;border:1px solid #243139;border-radius:10px;padding:12px 18px;text-decoration:none;font-weight:700">${copy.action}</a>
              <p style="font-size:12px;line-height:1.5;color:#7D8588;margin:24px 0 0">For privacy, Covie keeps the details of the change inside your account rather than copying them into email.</p>
            </div>
          </div>
        </div>
      `,
    }),
  }).catch(() => null);

  if (!response?.ok) {
    console.error("Approval email delivery failed", {
      status: response?.status ?? null,
      kind: input.kind,
    });
    return { sent: false as const, reason: "provider_error" };
  }

  return { sent: true as const };
}
