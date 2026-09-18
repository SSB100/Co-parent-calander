import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Handshake,
  ListChecks,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CovieBrand } from "@/components/workspace/covie-brand";
import { auth } from "@/lib/auth/server";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Covie | Life between two homes, made simpler",
  description:
    "Covie keeps parenting schedules, expenses, responsibilities and shared agreements clear in one bright, simple co-parenting organiser.",
};

const previewDays = [
  { day: "14", owner: "me" },
  { day: "15", owner: "me" },
  { day: "16", owner: "split" },
  { day: "17", owner: "them", note: "School show" },
  { day: "18", owner: "them" },
  { day: "19", owner: "them" },
  { day: "20", owner: "me" },
  { day: "21", owner: "me" },
  { day: "22", owner: "splitReverse" },
  { day: "23", owner: "them" },
  { day: "24", owner: "them", task: true },
  { day: "25", owner: "me" },
  { day: "26", owner: "me" },
  { day: "27", owner: "me" },
];

const steps = [
  {
    number: "01",
    title: "Create or join",
    description:
      "Start a Covie calendar yourself, or join one your co-parent has already created with a private code.",
    accent: "text-[#FF6B5F]",
  },
  {
    number: "02",
    title: "Plan together",
    description:
      "Keep parenting days, family events, shared costs, responsibilities and decisions in one clear place.",
    accent: "text-[#F4C64E]",
  },
  {
    number: "03",
    title: "Know what’s next",
    description:
      "See the plan at a glance without digging through messages or asking the same questions again.",
    accent: "text-[#62D2C3]",
  },
];

export default async function Home() {
  const { data: session } = await auth.getSession();
  if (session?.user) {
    const calendar = await getCalendarSession();
    redirect(calendar ? "/calendar" : "/onboarding");
  }

  return (
    <main className="min-h-screen bg-[#FFF9F2] text-[#243139]">
      <nav
        className="border-b-2 border-[#243139] bg-[#FFF9F2]"
        aria-label="Main navigation"
      >
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <CovieBrand />
          <div className="hidden items-center gap-7 md:flex">
            <a
              href="#how-it-works"
              className="text-sm font-semibold hover:text-[#D94D43]"
            >
              How it works
            </a>
            <a
              href="#features"
              className="text-sm font-semibold hover:text-[#D94D43]"
            >
              What Covie does
            </a>
            <Link
              href="/auth/sign-in"
              className="text-sm font-semibold hover:text-[#D94D43]"
            >
              Log in
            </Link>
            <Link
              href="/auth/sign-up"
              className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[#243139] px-5 text-sm font-semibold text-white transition hover:bg-[#35474F]"
            >
              Create an account
            </Link>
          </div>
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border-2 border-[#243139] px-4 text-sm font-semibold md:hidden"
          >
            Log in
          </Link>
        </div>
      </nav>

      <section className="overflow-hidden border-b-2 border-[#243139]">
        <div className="mx-auto grid w-full max-w-[1600px] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex items-center bg-[#FFF9F2] px-4 py-14 sm:px-8 sm:py-20 lg:px-14 lg:py-24 xl:px-20">
            <div className="max-w-3xl">
              <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-[#243139]">
                <span className="h-3 w-3 bg-[#FF6B5F]" aria-hidden="true" />
                Co-parenting, organised in one shared place.
              </p>

              <h1 className="covie-display mt-7 max-w-3xl text-[clamp(3.6rem,7.4vw,7.2rem)] font-semibold leading-[0.91] tracking-[-0.045em] text-[#243139]">
                Life between two homes, made simpler.
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#43535A] sm:text-xl">
                Covie gives co-parents one clear view of who has the children, what is
                happening, what needs doing, what needs paying and what you have both
                agreed to.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/sign-up"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-[#FF6B5F] px-6 text-sm font-bold text-[#243139] transition hover:bg-[#F35F54]"
                >
                  Create your calendar
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex min-h-12 items-center justify-center rounded-[10px] border-2 border-[#243139] bg-[#FFF9F2] px-6 text-sm font-bold transition hover:bg-white"
                >
                  See how Covie works
                </a>
              </div>

              <p className="mt-6 max-w-xl border-l-4 border-[#19A897] pl-4 text-sm leading-6 text-[#56636A]">
                Start on your own or invite the other parent later. Covie works even if
                only one parent chooses to use it.
              </p>
            </div>
          </div>

          <div
            className="relative min-h-[610px] overflow-hidden bg-[#19A897] px-4 py-12 sm:px-8 lg:flex lg:min-h-[720px] lg:items-center lg:px-14"
            aria-hidden="true"
          >
            <div className="absolute right-0 top-0 h-28 w-28 bg-[#F4C64E] sm:h-40 sm:w-40" />
            <div className="absolute bottom-0 left-0 h-20 w-44 bg-[#FF6B5F] sm:h-28 sm:w-64" />

            <div className="relative z-10 mx-auto w-full max-w-2xl border-2 border-[#243139] bg-[#FFFDFB] p-4 shadow-[10px_10px_0_#243139] sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b-2 border-[#243139] pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#5B686E]">
                    Shared family calendar
                  </p>
                  <h2 className="covie-display mt-1 text-3xl font-semibold text-[#243139]">
                    September
                  </h2>
                </div>
                <div className="bg-[#F4C64E] px-3 py-2 text-xs font-bold text-[#243139]">
                  Less back-and-forth. More clarity.
                </div>
              </div>

              <div className="mt-5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-[#5B686E] sm:text-xs">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <div key={day} className="py-1">
                    {day}
                  </div>
                ))}
              </div>

              <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                {previewDays.map((item) => {
                  const split =
                    item.owner === "split" || item.owner === "splitReverse";
                  const ownerClass =
                    item.owner === "me"
                      ? "bg-[#C9EEE7]"
                      : item.owner === "them"
                        ? "bg-[#E1D8FA]"
                        : "bg-white";

                  return (
                    <div
                      key={item.day}
                      className={`relative min-h-16 overflow-hidden border border-[#93A0A5] p-2 sm:min-h-20 ${ownerClass}`}
                    >
                      {split ? (
                        <div className="absolute inset-0 flex">
                          <div
                            className={`w-1/2 ${item.owner === "split" ? "bg-[#C9EEE7]" : "bg-[#E1D8FA]"}`}
                          />
                          <div
                            className={`w-1/2 ${item.owner === "split" ? "bg-[#E1D8FA]" : "bg-[#C9EEE7]"}`}
                          />
                        </div>
                      ) : null}
                      <span className="relative z-10 text-xs font-bold text-[#243139]">
                        {item.day}
                      </span>
                      {item.note ? (
                        <span className="absolute inset-x-1 bottom-1 z-10 truncate bg-[#FF6B5F] px-1 py-0.5 text-[8px] font-bold text-[#243139] sm:text-[9px]">
                          {item.note}
                        </span>
                      ) : null}
                      {item.task ? (
                        <span className="absolute bottom-2 right-2 z-10 h-2.5 w-2.5 bg-[#F4C64E]" />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <div className="border-2 border-[#243139] bg-[#C9EEE7] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em]">
                    With you
                  </p>
                  <p className="mt-1 text-sm font-bold">Mon → Wed</p>
                </div>
                <div className="border-2 border-[#243139] bg-[#E1D8FA] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em]">
                    With them
                  </p>
                  <p className="mt-1 text-sm font-bold">Thu → Sun</p>
                </div>
                <div className="border-2 border-[#243139] bg-[#F4C64E] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em]">
                    Coming up
                  </p>
                  <p className="mt-1 text-sm font-bold">School show · Thu</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#243139] bg-[#FF6B5F]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em]">
                The week at a glance
              </p>
              <h2 className="covie-display mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
                One child. Two homes. One plan.
              </h2>
            </div>

            <div className="grid grid-cols-2 border-2 border-[#243139] bg-[#FFF9F2] sm:grid-cols-5">
              {[
                ["Mon", "You", "#C9EEE7"],
                ["Tue", "You", "#C9EEE7"],
                ["Wed", "You → Them", "#F4C64E"],
                ["Thu", "Them", "#E1D8FA"],
                ["Fri", "Them", "#E1D8FA"],
              ].map(([day, label, colour]) => (
                <div
                  key={day}
                  className="min-h-24 border-b-2 border-[#243139] p-4 last:border-b-0 sm:min-h-28 sm:border-b-0 sm:border-r-2 sm:last:border-r-0"
                  style={{ backgroundColor: colour }}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.12em]">{day}</p>
                  <p className="mt-7 text-lg font-bold">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-b-2 border-[#243139] bg-[#243139] text-[#FFF9F2]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#F4C64E]">
            How Covie works
          </p>
          <div className="mt-3 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <h2 className="covie-display text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
              Three steps. Then everyone can see what’s next.
            </h2>
            <p className="max-w-2xl text-base leading-7 text-[#D7DFE2] lg:justify-self-end">
              No complicated setup and no requirement for both parents to sign up
              before the calendar becomes useful.
            </p>
          </div>

          <div className="mt-12 grid border-y border-[#66747A] lg:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.number}
                className={`py-7 lg:px-7 ${index > 0 ? "border-t border-[#66747A] lg:border-l lg:border-t-0" : ""}`}
              >
                <span className={`text-4xl font-black ${step.accent}`}>
                  {step.number}
                </span>
                <h3 className="mt-7 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-[#D7DFE2]">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="features"
        className="border-b-2 border-[#243139] bg-[#FFF9F2]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D94D43]">
                Built for everyday co-parenting
              </p>
              <h2 className="covie-display mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
                Keep the important parts together.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-[#526168] lg:justify-self-end">
              Covie is deliberately simple. It is a shared organiser, not a payment
              app, legal evidence system or full messenger. The goal is clarity around
              the things families organise every week.
            </p>
          </div>

          <div className="mt-14 grid gap-10 border-t-2 border-[#243139] pt-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <div>
              <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.15em] text-[#0D7A6D]">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
                Schedule
              </div>
              <h3 className="covie-display mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
                See the parenting plan before you need to ask.
              </h3>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#526168]">
                Parenting days, half-day handovers and family events stay visible in
                one calendar, with both parent colours preserved.
              </p>
            </div>

            <div className="border-2 border-[#243139] bg-white p-5 shadow-[8px_8px_0_#19A897] sm:p-7">
              <div className="flex items-center justify-between border-b border-[#A8B2B6] pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#617077]">
                    Saturday 24
                  </p>
                  <p className="mt-1 text-xl font-bold">A full family day, in context</p>
                </div>
                <span className="bg-[#C9EEE7] px-3 py-1 text-xs font-bold">
                  With you
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="bg-[#C9EEE7] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em]">9:00</p>
                  <p className="mt-2 font-bold">Football</p>
                </div>
                <div className="bg-[#F4C64E] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em]">12:30</p>
                  <p className="mt-2 font-bold">Birthday lunch</p>
                </div>
                <div className="bg-[#E1D8FA] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em]">5:00</p>
                  <p className="mt-2 font-bold">Handover</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#243139] bg-[#F4C64E]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.18fr_0.82fr] lg:items-center lg:px-8">
          <div className="order-2 border-2 border-[#243139] bg-[#FFF9F2] lg:order-1">
            {[
              ["School camp", "$86.00", "Ready to review", "#B94038"],
              ["Football fees", "$48.00", "Agreed", "#08796D"],
              ["Dental check-up", "$32.00", "Added today", "#765ED6"],
            ].map(([name, amount, status, colour], index) => (
              <div
                key={name}
                className={`grid grid-cols-[1fr_auto] gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center ${index > 0 ? "border-t-2 border-[#243139]" : ""}`}
              >
                <div>
                  <p className="font-bold">{name}</p>
                  <p className="mt-1 text-xs text-[#617077]">Shared child expense</p>
                </div>
                <p className="text-lg font-black">{amount}</p>
                <span
                  className="col-span-2 w-fit px-2.5 py-1 text-xs font-bold text-white sm:col-span-1"
                  style={{ backgroundColor: colour }}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>

          <div className="order-1 lg:order-2">
            <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.15em]">
              <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
              Expenses
            </div>
            <h3 className="covie-display mt-4 text-5xl font-semibold leading-[0.97] tracking-[-0.03em]">
              Shared costs without the spreadsheet hunt.
            </h3>
            <p className="mt-5 max-w-xl text-base leading-7">
              Keep child-related costs visible, attach the useful details and see what
              has already been agreed.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#243139] bg-[#19A897]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
          <div>
            <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.15em]">
              <ListChecks className="h-5 w-5" aria-hidden="true" />
              Responsibilities
            </div>
            <h3 className="covie-display mt-4 text-5xl font-semibold leading-[0.97] tracking-[-0.03em]">
              Know what needs doing and who has it covered.
            </h3>
            <p className="mt-5 max-w-xl text-base leading-7">
              School forms, registrations, appointments and practical jobs can sit
              beside the family plan instead of disappearing into chat threads.
            </p>
          </div>

          <div className="border-2 border-[#243139] bg-[#FFF9F2]">
            {[
              ["Football registration", "You", "Due Friday", true],
              ["Book dentist", "Them", "Next week", false],
              ["Return school form", "You", "Done", true],
            ].map(([task, person, timing, active], index) => (
              <div
                key={String(task)}
                className={`grid grid-cols-[auto_1fr] gap-4 p-5 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center ${index > 0 ? "border-t-2 border-[#243139]" : ""}`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center border-2 border-[#243139] ${active ? "bg-[#FF6B5F]" : "bg-white"}`}
                >
                  {active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                </span>
                <p className="font-bold">{task}</p>
                <span className="text-sm font-semibold text-[#526168]">{person}</span>
                <span className="text-sm font-semibold">{timing}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#243139] bg-[#765ED6] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.18fr_0.82fr] lg:items-center lg:px-8">
          <div className="order-2 border-2 border-white bg-[#FFF9F2] p-5 text-[#243139] lg:order-1 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6651B7]">
              Change request
            </p>
            <h4 className="covie-display mt-3 text-3xl font-semibold">
              Swap Saturday 12th for Sunday 13th?
            </h4>
            <p className="mt-3 text-sm leading-6 text-[#526168]">
              A simple proposed change stays clear until both parents know the plan.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <span className="inline-flex min-h-11 items-center justify-center bg-[#243139] px-5 text-sm font-bold text-white">
                Accept
              </span>
              <span className="inline-flex min-h-11 items-center justify-center border-2 border-[#243139] px-5 text-sm font-bold">
                Suggest another
              </span>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.15em] text-[#FFF3A9]">
              <Handshake className="h-5 w-5" aria-hidden="true" />
              Agreements
            </div>
            <h3 className="covie-display mt-4 text-5xl font-semibold leading-[0.97] tracking-[-0.03em]">
              Keep shared decisions clear once you’ve agreed.
            </h3>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#F0EDFF]">
              Proposed changes and shared decisions can move from “we talked about it”
              to a plan both parents can actually see.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#243139] bg-[#FF6B5F]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
          <div className="max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em]">
              Start simply
            </p>
            <h2 className="covie-display mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
              Create the calendar now. Invite the other parent when it suits you.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7">
              There is no requirement for both parents to sign up first. Covie works
              even if one parent starts by organising the family schedule alone.
            </p>
          </div>

          <Link
            href="/auth/sign-up"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-[#243139] px-7 text-sm font-bold text-white transition hover:bg-[#35474F]"
          >
            Create an account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="bg-[#FFF9F2]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <CovieBrand />
          <p className="text-sm font-medium text-[#617077]">
            A bright, simple shared organiser for co-parenting.
          </p>
        </div>
      </footer>
    </main>
  );
}
