import Link from "next/link";
import { CovieBrand } from "@/components/workspace/covie-brand";

export function PublicHeader() {
  return (
    <nav
      className="border-b-2 border-[#243139] bg-[#FFF9F2]"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Covie home">
          <CovieBrand />
        </Link>

        <div className="hidden items-center gap-5 lg:flex">
          <Link
            href="/#how-it-works"
            className="text-sm font-semibold hover:text-[#D94D43]"
          >
            How it works
          </Link>
          <Link
            href="/#calendar-types"
            className="text-sm font-semibold hover:text-[#D94D43]"
          >
            Calendar types
          </Link>
          <Link
            href="/help"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#243139] bg-white px-4 text-sm font-semibold transition hover:bg-[#F7EFE5]"
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
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#243139] bg-[#FF6B5F] px-5 text-sm font-semibold text-[#243139] transition hover:bg-[#F35F54]"
          >
            Create an account
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Link
            href="/help"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#243139] bg-white px-3 text-sm font-semibold"
          >
            FAQ
          </Link>
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#243139] bg-[#FFF9F2] px-3 text-sm font-semibold text-[#243139]"
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
      <div className="mx-auto grid max-w-7xl gap-7 px-3 py-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-end lg:px-8">
        <div>
          <Link href="/" aria-label="Covie home">
            <CovieBrand />
          </Link>
          <p className="mt-3 max-w-lg text-sm font-medium leading-6 text-[#617077]">
            Purpose-built calendars for the plans you share. Staff Rosters, Salon Bookings, Shared Facilities, Social Groups and Co-parenting, together in Covie.
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
