"use client";

import {
  CircleHelp,
  KeyRound,
  Lightbulb,
  MessageCircle,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

const reasons = [
  {
    value: "account_help",
    label: "Account or login help",
    description: "Sign-in, verification, invitations or account access.",
    icon: KeyRound,
  },
  {
    value: "using_covie",
    label: "Help using Covie",
    description: "Questions about calendars, shared costs, tasks or approvals.",
    icon: CircleHelp,
  },
  {
    value: "privacy_security",
    label: "Privacy or security",
    description: "Personal information, access requests or a security concern.",
    icon: ShieldCheck,
  },
  {
    value: "request_feature",
    label: "Request a Feature",
    description: "Tell us what would make Covie more useful for your family.",
    icon: Lightbulb,
  },
  {
    value: "feedback",
    label: "Feedback or something else",
    description: "General feedback, a problem, or anything that does not fit above.",
    icon: MessageCircle,
  },
] as const;

type Reason = (typeof reasons)[number]["value"];

export function ContactForm() {
  const [reason, setReason] = useState<Reason | null>(null);
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const selected = reasons.find((item) => item.value === reason) ?? null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) return;

    setStatus("sending");
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        name: form.get("name"),
        email: form.get("email"),
        comments: form.get("comments"),
        website: form.get("website"),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setError(
        body?.error ??
          "Your message could not be sent right now. Please try again later.",
      );
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border-2 border-[#243139] bg-[#BFEDE6] p-6 shadow-[7px_7px_0_#243139]">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0D7A6D]">
          Message sent
        </p>
        <h3 className="covie-display mt-2 text-3xl font-semibold tracking-[-0.03em]">
          Thanks for getting in touch.
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#43535A]">
          Your message has been sent to the Covie team. We’ll use the email
          address you provided if a reply is needed.
        </p>
        <button
          type="button"
          onClick={() => {
            setReason(null);
            setStatus("idle");
          }}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#243139] bg-white px-4 text-sm font-bold"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {reasons.map((item) => {
          const Icon = item.icon;
          const selectedReason = item.value === reason;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setReason(item.value);
                setStatus("idle");
                setError(null);
              }}
              className={[
                "flex min-h-[104px] items-start gap-3 rounded-xl border-2 p-4 text-left transition",
                selectedReason
                  ? "border-[#243139] bg-[#F7DC86] shadow-[4px_4px_0_#243139]"
                  : "border-[#D8CEC3] bg-white hover:border-[#243139]",
              ].join(" ")}
              aria-pressed={selectedReason}
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] border border-[#243139] bg-[#FFF9F2]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-sm font-black text-[#243139]">
                  {item.label}
                </strong>
                <span className="mt-1 block text-xs leading-5 text-[#617077]">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <form
          onSubmit={submit}
          className="mt-6 rounded-2xl border-2 border-[#243139] bg-white p-5 shadow-[7px_7px_0_#765ED6] sm:p-6"
        >
          <div className="border-b border-[#E6DBCF] pb-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6651B7]">
              {selected.label}
            </p>
            <h3 className="covie-display mt-1 text-3xl font-semibold tracking-[-0.03em]">
              Tell us a little more.
            </h3>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold">Name</span>
              <input
                name="name"
                autoComplete="name"
                maxLength={80}
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-[#B8C0C3] bg-white px-4 text-base outline-none focus:border-[#243139] focus:ring-2 focus:ring-[#BFEDE6]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold">Email</span>
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={256}
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-[#B8C0C3] bg-white px-4 text-base outline-none focus:border-[#243139] focus:ring-2 focus:ring-[#BFEDE6]"
              />
            </label>
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-bold">Comments</span>
            <textarea
              name="comments"
              rows={6}
              maxLength={2000}
              required
              className="mt-2 w-full resize-y rounded-xl border border-[#B8C0C3] bg-white px-4 py-3 text-base leading-6 outline-none focus:border-[#243139] focus:ring-2 focus:ring-[#BFEDE6]"
              placeholder={
                reason === "request_feature"
                  ? "What would you like Covie to do, and how would it help?"
                  : "What can we help with?"
              }
            />
          </label>

          <label className="hidden" aria-hidden="true">
            Website
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              maxLength={200}
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status === "sending"}
            className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-[#243139] bg-[#FF6B5F] px-6 text-sm font-black text-[#243139] transition hover:bg-[#F35F54] disabled:cursor-wait disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {status === "sending" ? "Sending…" : "Send message"}
          </button>
        </form>
      ) : (
        <p className="mt-5 text-sm leading-6 text-[#617077]">
          Choose the option that best matches what you need and the contact form
          will appear here.
        </p>
      )}
    </div>
  );
}
