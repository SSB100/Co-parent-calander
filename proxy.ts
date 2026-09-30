import { auth } from "@/lib/auth/server";
import type { NextRequest } from "next/server";
import { inviteSignInPath } from "@/lib/security/invites";

export default function proxy(request: NextRequest) {
  const loginUrl = request.nextUrl.pathname === "/onboarding"
    ? inviteSignInPath(request.nextUrl.searchParams.get("invite"))
    : "/auth/sign-in";
  return auth.middleware({ loginUrl })(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/calendar/:path*",
    "/calendar-types/:path*",
    "/home/:path*",
    "/organiser/:path*",
    "/expenses/:path*",
    "/responsibilities/:path*",
    "/kids/:path*",
    "/onboarding/:path*",
  ],
};
