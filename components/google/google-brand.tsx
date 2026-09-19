import type { SVGProps } from "react";

export const googleActionClassName =
  "inline-flex min-h-11 items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-4 text-sm font-medium leading-5 text-[#1F1F1F] transition hover:bg-[#F8FAFF] disabled:cursor-wait disabled:opacity-60";

export function GoogleGMark({
  className = "h-5 w-5",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 18 18"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.715v2.258h2.908c1.702-1.566 2.684-3.874 2.684-6.614Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.908-2.258c-.806.54-1.836.859-3.048.859-2.344 0-4.329-1.585-5.037-3.715H.956v2.333A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.705A5.41 5.41 0 0 1 3.68 9c0-.589.103-1.166.283-1.705V4.962H.956A9 9 0 0 0 0 9c0 1.456.347 2.827.956 4.038l3.007-2.333Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.442 1.345l2.581-2.581C13.463.891 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.333C4.671 5.164 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
