import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Handshake,
  ListChecks,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CovieBrand } from "@/components/workspace/covie-brand";
import { auth } from "@/lib/auth/server";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Covie | Co-parenting, organised in one shared place",
  description:
    "Covie keeps parenting schedules, expenses, responsibilities and shared agreements clear in one calm co-parenting organiser.",
};

const steps = [
  {
    number: "01",
    title: "Create or join",
    description:
      "Start a Covie calendar yourself, or join one your co-parent has already created with a private code.",
  },
  {
    number: "02",
    title: "Plan together",
    description:
      "Keep parenting days, family events, shared costs, responsibilities and decisions in one clear place.",
  },
  {
    number: "03",
    title: "Know what’s next",
    description:
      "See the plan at a glance without digging through messages or asking the same questions again.",
  },
];

const features = [
  {
    title: "Schedule",
    description: "See parenting days, handovers and family events clearly.",
    icon: CalendarDays,
    iconClass: "bg-emerald-100 text-emerald-800",
  },
  {
    title: "Expenses",
    description: "Keep shared child-related costs visible and organised.",
    icon: CircleDollarSign,
    iconClass: "bg-amber-100 text-amber-800",
  },
  {
    title: "Responsibilities",
    description: "Know what needs doing and who is handling it.",
    icon: ListChecks,
    iconClass: "bg-blue-100 text-blue-700",
  },
  {
    title: "Agreements",
    description: "Keep shared decisions clear once both parents have agreed.",
    icon: Handshake,
    iconClass: "bg-violet-100 text-violet-800",
  },
];

export default async function Home() {
  const { data: session } = await auth.getSession();
  if (session?.user) {
    const calendar = await getCalendarSession();
    redirect(calendar ? "/calendar" : "/onboarding");
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav
          className="flex min-h-20 items-center justify-between gap-4"
          aria-label="Main navigation"
        >
          <CovieBrand />
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-950"
          >
            Log in
          </Link>
        </nav>

        <section className="grid gap-12 pb-16 pt-10 sm:pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)] lg:items-center lg:gap-16 lg:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Less back-and-forth. More clarity.
            </div>

            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Co-parenting,
              <span className="block text-emerald-800">
                organised in one shared place.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Covie gives co-parents one clear view of what is happening, who has the
              children, what needs doing, what needs paying and what you have both
              agreed to.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/sign-up"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:bg-emerald-900"
              >
                Create an account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/auth/sign-in"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Log in
              </Link>
            </div>

            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-500">
              Start on your own or invite the other parent later. Covie works even if
              only one parent chooses to use it.
            </p>
          </div>

          <div
            className="relative mx-auto w-full max-w-xl"
            aria-label="Example Covie calendar"
          >
            <div className="absolute -inset-4 rounded-[2rem] bg-white/35 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(39,54,50,0.12)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Shared family calendar
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                    Drake
                  </h2>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  In sync
                </span>
              </div>

              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="py-1">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                  {[
                    { day: "14", owner: "you" },
                    { day: "15", owner: "you" },
                    { day: "16", owner: "split" },
                    { day: "17", owner: "them", note: "School show" },
                    { day: "18", owner: "them" },
                    { day: "19", owner: "them" },
                    { day: "20", owner: "you" },
                    { day: "21", owner: "you" },
                    { day: "22", owner: "splitReverse" },
                    { day: "23", owner: "them" },
                    { day: "24", owner: "them", task: true },
                    { day: "25", owner: "you" },
                    { day: "26", owner: "you" },
                    { day: "27", owner: "you" },
                  ].map((item) => {
                    const ownerClass =
                      item.owner === "you"
                        ? "bg-[#dfeae2]"
                        : item.owner === "them"
                          ? "bg-[#ece4f0]"
                          : item.owner === "split"
                            ? "covie-split-forward"
                            : "covie-split-reverse";

                    return (
                      <div
                        key={item.day}
                        className={`relative min-h-16 rounded-xl border border-white/70 p-2 ${ownerClass}`}
                      >
                        <span className="text-xs font-semibold text-slate-800">
                          {item.day}
                        </span>
                        {item.note ? (
                          <span className="absolute inset-x-1 bottom-1 truncate rounded-md bg-white/90 px-1 py-0.5 text-[8px] font-semibold text-slate-700">
                            {item.note}
                          </span>
                        ) : null}
                        {item.task ? (
                          <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-blue-600" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">Next handover</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      Wed 16 · 3:00 pm
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">Coming up</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      School show · Thu 17
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="border-y border-slate-200 bg-white/55">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
              How Covie works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Three simple steps. One shared picture.
            </h2>
          </div>

          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.number}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="text-sm font-semibold text-emerald-700">
                  {step.number}
                </span>
                <h3 className="mt-8 text-xl font-semibold text-slate-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Everything that needs clarity
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Keep the important parts of co-parenting together.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Covie is deliberately simple. It is not a payment app, legal evidence
              system or full messenger. It is a shared organiser built to reduce
              confusion around everyday parenting.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map(({ title, description, icon: Icon, iconClass }) => (
              <article
                key={title}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconClass}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Start simply
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                Create your calendar now. Invite the other parent when it suits you.
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                There is no requirement for both parents to sign up before you can
                start organising the family schedule.
              </p>
            </div>

            <Link
              href="/auth/sign-up"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:bg-emerald-900"
            >
              Create an account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <CovieBrand compact />
          <p>A calm shared organiser for co-parenting.</p>
        </div>
      </footer>
    </main>
  );
}
