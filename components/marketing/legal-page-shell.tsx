import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/components/marketing/public-chrome";

export function LegalPageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#FFF9F2] text-[#243139]">
      <PublicHeader />

      <section className="border-b-2 border-[#243139] bg-[#243139] text-[#FFF9F2]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#F4C64E]">
              {eyebrow}
            </p>
            <h1 className="covie-display mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.04em] sm:text-6xl">
              {title}
            </h1>
          </div>
          <p className="max-w-2xl text-base leading-7 text-[#D7DFE2] lg:justify-self-end">
            {intro}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <article className="rounded-2xl border-2 border-[#243139] bg-white p-5 shadow-[8px_8px_0_#19A897] sm:p-8 lg:p-10">
          <div className="covie-legal-copy">{children}</div>
        </article>
      </section>

      <PublicFooter />
    </main>
  );
}
