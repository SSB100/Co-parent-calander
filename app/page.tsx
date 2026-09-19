import {
  ArrowRight,
  Bell,
  CalendarDays,
  CircleDollarSign,
  Handshake,
  ListChecks,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarProductPreview,
  ExpenseProductPreview,
  ResponsibilityProductPreview,
  UpdatesProductPreview,
} from "@/components/marketing/product-previews";
import { CovieBrand } from "@/components/workspace/covie-brand";
import { auth } from "@/lib/auth/server";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Covie | Life between two homes, made simpler",
  description:
    "Covie keeps parenting schedules, expenses, responsibilities and shared agreements clear in one bright, simple co-parenting organiser.",
};

const steps = [
  {
    number: "01",
    title: "Create or join",
    description: "Start your own family calendar or join one with a private invite code.",
  },
  {
    number: "02",
    title: "Add the plan",
    description: "Set parenting days, events, costs and responsibilities in one place.",
  },
  {
    number: "03",
    title: "See what matters",
    description: "Open Covie and immediately know what is next and what needs your attention.",
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
      <nav className="border-b-2 border-[#243139] bg-[#FFF9F2]" aria-label="Main navigation">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <CovieBrand />
          <div className="hidden items-center gap-7 md:flex">
            <a href="#how-it-works" className="text-sm font-semibold hover:text-[#D94D43]">How it works</a>
            <a href="#features" className="text-sm font-semibold hover:text-[#D94D43]">What Covie does</a>
            <Link href="/auth/sign-in" className="text-sm font-semibold hover:text-[#D94D43]">Log in</Link>
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

      <section className="border-b-2 border-[#243139] lg:h-[calc(100svh-5rem)] lg:min-h-[480px] lg:max-h-[760px]">
        <div className="mx-auto grid h-full w-full max-w-[1500px] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex items-center px-4 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-8 xl:px-16">
            <div className="max-w-2xl">
              <h1 className="covie-display text-[clamp(3.15rem,6vw,6rem)] font-semibold leading-[0.92] tracking-[-0.045em] text-[#243139]">
                Life between two homes, made simpler.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-7 text-[#43535A] sm:text-xl">
                One shared place for parenting days, family events, expenses, responsibilities and the things you have agreed.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
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
                  See Covie in action
                </a>
              </div>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[#56636A]">
                You can start on your own and invite the other parent later.
              </p>
            </div>
          </div>

          <div className="relative flex min-h-[430px] items-center overflow-hidden bg-[#19A897] px-4 py-8 sm:px-8 lg:min-h-0 lg:px-10 lg:py-6">
            <div className="absolute right-0 top-0 h-24 w-24 bg-[#F4C64E] sm:h-32 sm:w-32" />
            <div className="absolute bottom-0 left-0 h-16 w-40 bg-[#FF6B5F] sm:h-20 sm:w-52" />
            <div className="relative z-10 mx-auto w-full max-w-2xl">
              <CalendarProductPreview />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#243139] bg-[#FF6B5F]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.75fr_1.25fr] lg:items-center lg:px-8">
          <h2 className="covie-display text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
            One child. Two homes. One plan.
          </h2>
          <div className="grid grid-cols-2 border-2 border-[#243139] sm:grid-cols-5">
            {[
              ["Mon", "Alex", "#BFEDE6"],
              ["Tue", "Alex", "#BFEDE6"],
              ["Wed", "Alex / Sam", "#F4C64E"],
              ["Thu", "Sam", "#DDD3FA"],
              ["Fri", "Sam", "#DDD3FA"],
            ].map(([day, label, colour]) => (
              <div
                key={day}
                className="min-h-24 border-b-2 border-[#243139] p-4 last:border-b-0 sm:border-b-0 sm:border-r-2 sm:last:border-r-0"
                style={{ backgroundColor: colour }}
              >
                <strong className="text-sm">{day}</strong>
                <p className="mt-5 font-bold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b-2 border-[#243139] bg-[#243139] text-[#FFF9F2]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <h2 className="covie-display text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
              Get set up without turning co-parenting into admin.
            </h2>
            <p className="max-w-2xl text-base leading-7 text-[#D7DFE2] lg:justify-self-end">
              Covie stays deliberately small. Set up the family calendar, add what matters and use Updates when something needs a decision.
            </p>
          </div>
          <div className="mt-10 grid border-y border-[#66747A] lg:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.number}
                className={`py-6 lg:px-7 ${index > 0 ? "border-t border-[#66747A] lg:border-l lg:border-t-0" : ""}`}
              >
                <span className="text-3xl font-black text-[#F4C64E]">{step.number}</span>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[#D7DFE2]">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-b-2 border-[#243139] bg-[#FFF9F2]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <h2 className="covie-display text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
              The same screens you will actually use.
            </h2>
            <p className="max-w-2xl text-base leading-7 text-[#526168] lg:justify-self-end">
              The examples below mirror Covie’s real Calendar, Updates, Expenses and Responsibilities interfaces rather than separate marketing mockups.
            </p>
          </div>

          <div className="mt-12 grid gap-10 border-t-2 border-[#243139] pt-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <div>
              <div className="flex items-center gap-3 text-lg font-bold text-[#0D7A6D]">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
                Schedule
              </div>
              <h3 className="covie-display mt-3 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
                See the parenting plan before you need to ask.
              </h3>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#526168]">
                Parent names sit directly on their days, split days show both halves, and family events stay visible along the bottom of each date.
              </p>
            </div>
            <CalendarProductPreview compact />
          </div>

          <div className="mt-14 grid gap-8 border-t-2 border-[#243139] pt-10 lg:grid-cols-3">
            <div>
              <div className="flex items-center gap-3 text-lg font-bold">
                <Bell className="h-5 w-5" aria-hidden="true" />
                Updates
              </div>
              <p className="mt-3 text-sm leading-6 text-[#526168]">
                Approvals waiting for you are counted in navigation and collected in one place.
              </p>
              <div className="mt-5"><UpdatesProductPreview /></div>
            </div>
            <div>
              <div className="flex items-center gap-3 text-lg font-bold">
                <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
                Expenses
              </div>
              <p className="mt-3 text-sm leading-6 text-[#526168]">
                Record who paid, how the cost is split and whether reimbursement is still outstanding.
              </p>
              <div className="mt-5"><ExpenseProductPreview /></div>
            </div>
            <div>
              <div className="flex items-center gap-3 text-lg font-bold">
                <ListChecks className="h-5 w-5" aria-hidden="true" />
                Responsibilities
              </div>
              <p className="mt-3 text-sm leading-6 text-[#526168]">
                Keep practical jobs visible with the responsible parent and due date attached.
              </p>
              <div className="mt-5"><ResponsibilityProductPreview /></div>
            </div>
          </div>

          <div className="mt-14 grid gap-8 border-t-2 border-[#243139] pt-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="flex items-center gap-3 text-lg font-bold text-[#6651B7]">
                <Handshake className="h-5 w-5" aria-hidden="true" />
                Agreements
              </div>
              <h3 className="covie-display mt-3 text-4xl font-semibold tracking-[-0.03em]">
                Changes stay clear until both parents know the plan.
              </h3>
              <p className="mt-4 text-base leading-7 text-[#526168]">
                Proposed calendar changes appear in Updates with the real accept and decline flow used inside Covie.
              </p>
            </div>
            <UpdatesProductPreview />
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#243139] bg-[#FF6B5F]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
          <div className="max-w-4xl">
            <h2 className="covie-display text-5xl font-semibold leading-[0.96] tracking-[-0.035em] sm:text-6xl">
              Start with the calendar. Add the rest when you need it.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7">
              There is no requirement for both parents to sign up before Covie becomes useful.
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
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <CovieBrand />
          <p className="text-sm font-medium text-[#617077]">A bright, simple shared organiser for co-parenting.</p>
        </div>
      </footer>
    </main>
  );
}
