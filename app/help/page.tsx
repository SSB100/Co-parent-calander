import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";
import { PublicFooter, PublicHeader } from "@/components/marketing/public-chrome";

export const metadata: Metadata = {
  title: "FAQ & Contact",
  description: "Answers to common Covie questions and a simple way to contact us.",
};

const faqs = [
  {
    question: "What is Covie for?",
    answer:
      "Covie is a shared co-parenting organiser for parenting days, family events, shared costs, practical tasks, child information and changes that need agreement.",
  },
  {
    question: "Does the other parent need an account straight away?",
    answer:
      "No. You can create a calendar first and invite the other parent later. Shared approval features become most useful once both parents have joined.",
  },
  {
    question: "Can one parent change shared information on their own?",
    answer:
      "Changes that affect the shared plan can require approval from the other parent. The Updates area shows what is waiting, approved, declined or withdrawn.",
  },
  {
    question: "Is Covie a legal record or court evidence service?",
    answer:
      "No. Covie is an everyday organiser. It does not determine legal parenting rights, replace a parenting agreement or court order, or provide legal advice.",
  },
  {
    question: "How are passwords and accounts protected?",
    answer:
      "Covie uses managed authentication, email verification for new email/password accounts, signed sessions and server-side calendar permissions. Passwords are not stored by Covie as readable plain text.",
  },
  {
    question: "Who can see my family calendar?",
    answer:
      "Only authenticated accounts with membership of that specific calendar can access its information, subject to their permission level.",
  },
  {
    question: "What happens if I connect Google Calendar?",
    answer:
      "Covie creates and manages a separate Google calendar using a limited calendar permission. The connection is optional and can be disconnected from Covie.",
  },
  {
    question: "Can I reset a forgotten password?",
    answer:
      "Yes. Use Forgot password on the sign-in page and follow the reset email from Covie's authentication provider.",
  },
  {
    question: "What information should I put in a child profile?",
    answer:
      "Only add information that is genuinely useful for co-parenting and that you are entitled to share. Take extra care with medical, school and identity information.",
  },
  {
    question: "How do I report a privacy or security concern?",
    answer:
      "Use the contact section below and choose Privacy or security. If the concern involves account access, include enough detail for us to identify the issue without sending passwords or other secrets.",
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#FFF9F2] text-[#243139]">
      <PublicHeader />

      <section className="border-b-2 border-[#243139] bg-[#BFEDE6]">
        <div className="mx-auto grid max-w-7xl gap-7 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0D7A6D]">
              FAQ & Contact
            </p>
            <h1 className="covie-display mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.04em] sm:text-6xl">
              Start with the answer. Contact us if you still need a hand.
            </h1>
          </div>
          <p className="max-w-2xl text-base leading-7 text-[#43535A] lg:justify-self-end">
            Common Covie questions are below. If yours is not covered, choose
            what you are contacting us about and send a short message.
          </p>
        </div>
      </section>

      <section className="border-b-2 border-[#243139]">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#D94D43]">
                Common questions
              </p>
              <h2 className="covie-display mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Quick answers about Covie.
              </h2>
            </div>
            <Link
              href="#contact"
              className="text-sm font-bold underline decoration-[#FF6B5F] decoration-2 underline-offset-4"
            >
              Skip to contact
            </Link>
          </div>

          <div className="grid gap-3">
            {faqs.map((faq, index) => (
              <details
                key={faq.question}
                className="group rounded-xl border-2 border-[#243139] bg-white"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-left font-black marker:hidden sm:px-5">
                  <span>{faq.question}</span>
                  <span
                    className={[
                      "flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[#243139] text-lg leading-none transition group-open:rotate-45",
                      index % 3 === 0
                        ? "bg-[#F7DC86]"
                        : index % 3 === 1
                          ? "bg-[#DDD3FA]"
                          : "bg-[#FFD0CB]",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="border-t border-[#E6DBCF] px-4 py-4 text-sm leading-6 text-[#526168] sm:px-5">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-6 bg-[#FFF9F2]">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mb-7 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6651B7]">
              Contact Covie
            </p>
            <h2 className="covie-display mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              What are you contacting us about?
            </h2>
            <p className="mt-3 text-base leading-7 text-[#526168]">
              Choose a reason first so we can keep the form short and make your
              message easier to understand.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
