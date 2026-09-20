import Link from "next/link";
import { CovieBrand } from "@/components/workspace/covie-brand";

export function PublicHeader() {
  return (
    <nav
      className="border-b-2 border-[#243139] bg-[#FFF9F2]"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Covie home">
          <CovieBrand />
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/#how-it-works"
            className="text-sm font-semibold hover:text-[#D94D43]"
          >
            How it works
          </Link>
          <Link
            href="/#features"
            className="text-sm font-semibold hover:text-[#D94D43]"
          >
            What Covie does
          </Link>
          <Link
            href="/help"
            className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#243139] bg-white px-4 text-sm font-semibold transition hover:bg-[#F7EFE5]"
          >
            FAQ
          </Link>
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

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/help"
            className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#243139] bg-white px-3 text-sm font-semibold"
          >
            FAQ
          </Link>
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-10 items-center justify-center rounded-[10px] bg-[#243139] px-3 text-sm font-semibold text-white"
          >
            Log in
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t-2 border-[#243139] bg-[#FFF9F2]">
      <div className="mx-auto grid max-w-7xl gap-7 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-end lg:px-8">
        <div>
          <Link href="/" aria-label="Covie home">
            <CovieBrand />
          </Link>
          <p className="mt-3 max-w-lg text-sm font-medium leading-6 text-[#617077]">
            A bright, simple shared organiser for co-parenting.
          </p>
        </div>

        <nav
          className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-[#43535A] md:justify-end"
          aria-label="Footer"
        >
          <Link href="/help" className="hover:text-[#D94D43]">
            FAQ
          </Link>
          <Link href="/help#contact" className="hover:text-[#D94D43]">
            Contact
          </Link>
          <Link href="/terms" className="hover:text-[#D94D43]">
            Terms & Conditions
          </Link>
          <Link href="/privacy" className="hover:text-[#D94D43]">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
