import { getSql } from "@/lib/db";

export type StaffRosterEmailKind =
  | "roster_published"
  | "roster_updated";

type RecipientRow = {
  member_id: string;
  email: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://covie.app").replace(/\/$/, "");
}

function weekLabel(weekStart: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(weekStart + "T00:00:00Z"));
}

export function staffRosterEmailCopy(kind: StaffRosterEmailKind, weekStart: string) {
  const week = weekLabel(weekStart);

  if (kind === "roster_published") {
    return {
      subject: "Your Covie roster is ready",
      heading: "Your roster is ready",
      body:
        "Your roster for the week beginning " +
        week +
        " has been published. Open Covie to see your shifts.",
    };
  }

  return {
    subject: "Your Covie roster was updated",
    heading: "Your roster has changed",
    body:
      "Your published roster for the week beginning " +
      week +
      " has been updated. Open Covie to review the current roster.",
  };
}

export function staffRosterEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function linkedStaffRecipients(calendarId: string) {
  const sql = getSql();
  return (await sql`
    SELECT
      member.id AS member_id,
      auth_user.email
    FROM staff_roster_members member
    JOIN calendar_memberships membership
      ON membership.id = member.membership_id
    JOIN neon_auth."user" auth_user
      ON auth_user.id = membership.user_id
    WHERE member.calendar_id = ${calendarId}
      AND member.active = true
      AND member.membership_id IS NOT NULL
      AND auth_user.email IS NOT NULL
  `) as RecipientRow[];
}

export async function sendStaffRosterEmails(input: {
  calendarId: string;
  memberIds: string[];
  kind: StaffRosterEmailKind;
  weekStart: string;
}) {
  const requestedIds = [...new Set(input.memberIds)].filter(Boolean);

  if (requestedIds.length === 0) {
    return {
      configured: staffRosterEmailConfigured(),
      attempted: 0,
      sent: 0,
      failed: 0,
      skippedUnlinked: 0,
    };
  }

  const requested = new Set(requestedIds);
  const recipients = (await linkedStaffRecipients(input.calendarId).catch(
    () => [] as RecipientRow[],
  )).filter((recipient) => requested.has(recipient.member_id));
  const skippedUnlinked = Math.max(0, requestedIds.length - recipients.length);

  if (!staffRosterEmailConfigured()) {
    return {
      configured: false,
      attempted: 0,
      sent: 0,
      failed: 0,
      skippedUnlinked,
    };
  }

  const copy = staffRosterEmailCopy(input.kind, input.weekStart);
  const updatesUrl = appUrl() + "/calendar-types/staff-rosters/updates";
  const from = process.env.EMAIL_FROM!;

  let sent = 0;
  let failed = 0;

  await Promise.all(
    recipients.map(async (recipient) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: copy.subject,
          text:
            copy.heading +
            "\n\n" +
            copy.body +
            "\\n\\nOpen Covie: " +
            updatesUrl +
            "\\n\\nFor privacy, Covie keeps shift details inside your account rather than copying them into email.",
          html:
            '<div style="font-family:Arial,Helvetica,sans-serif;background:#FFF9F2;padding:24px;color:#243139">' +
            '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:2px solid #243139;border-radius:16px;overflow:hidden">' +
            '<div style="height:8px;background:#19A897"></div>' +
            '<div style="padding:24px">' +
            '<div style="font-size:26px;font-weight:700;margin-bottom:18px">Covie</div>' +
            '<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">' +
            copy.heading +
            '</h1>' +
            '<p style="font-size:15px;line-height:1.6;color:#526168;margin:0 0 22px">' +
            copy.body +
            '</p>' +
            '<a href="' +
            updatesUrl +
            '" style="display:inline-block;background:#FF6B5F;color:#243139;border:1px solid #243139;border-radius:10px;padding:12px 18px;text-decoration:none;font-weight:700">Open Covie</a>' +
            '<p style="font-size:12px;line-height:1.5;color:#7D8588;margin:24px 0 0">For privacy, Covie keeps shift details inside your account rather than copying them into email.</p>' +
            "</div></div></div>",
        }),
      }).catch(() => null);

      if (response?.ok) sent += 1;
      else failed += 1;
    }),
  );

  if (failed > 0) {
    console.error("Staff roster email delivery failed", {
      kind: input.kind,
      failed,
      attempted: recipients.length,
    });
  }

  return {
    configured: true,
    attempted: recipients.length,
    sent,
    failed,
    skippedUnlinked,
  };
}
