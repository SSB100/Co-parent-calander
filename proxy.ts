import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/auth/sign-in" });

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
