import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/security/request";

const contactReasons = {
  account_help: "Account or login help",
  using_covie: "Help using Covie",
  privacy_security: "Privacy or security",
  request_feature: "Request a Feature",
  feedback: "Feedback or something else",
} as const;

const contactSchema = z.object({
  reason: z.enum([
    "account_help",
    "using_covie",
    "privacy_security",
    "request_feature",
    "feedback",
  ]),
  name: z.string().trim().min(1, "Add your name.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(256),
  comments: z
    .string()
    .trim()
    .min(3, "Add a little more detail.")
    .max(2000, "Keep your message under 2,000 characters."),
  website: z.string().max(200).optional().default(""),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const parsed = contactSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check your contact details and try again.",
      },
      { status: 400 },
    );
  }

  // Honeypot field: accept silently so simple bots do not learn the trap.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.CONTACT_EMAIL;
  if (!apiKey || !from || !to) {
    return NextResponse.json(
      {
        error:
          "Contact delivery is not configured yet. Please try again later.",
      },
      { status: 503 },
    );
  }

  const reasonLabel = contactReasons[parsed.data.reason];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Covie contact: ${reasonLabel}`,
      text: [
        `Contact reason: ${reasonLabel}`,
        `Name: ${parsed.data.name}`,
        `Email: ${parsed.data.email}`,
        "",
        parsed.data.comments,
        "",
        "This message was sent from the public Covie FAQ & Contact page.",
      ].join("\n"),
    }),
  }).catch(() => null);

  if (!response?.ok) {
    console.error("Covie contact delivery failed", {
      status: response?.status ?? null,
      reason: parsed.data.reason,
    });
    return NextResponse.json(
      { error: "Your message could not be sent right now. Please try again later." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
