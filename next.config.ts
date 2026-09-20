import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const productionDeploymentRedirects =
  process.env.VERCEL_ENV === "production" &&
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? [
        {
          source: "/:path*",
          has: [
            {
              type: "host" as const,
              value:
                "co-parent-calander-[a-z0-9]{9}-haakers-projects\\.vercel\\.app",
            },
          ],
          destination: `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/:path*`,
          permanent: false,
        },
      ]
    : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return productionDeploymentRedirects;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0",
          },
        ],
      },
      ...[
        "/dashboard/:path*",
        "/calendar/:path*",
        "/home/:path*",
        "/organiser/:path*",
        "/expenses/:path*",
        "/responsibilities/:path*",
        "/kids/:path*",
        "/onboarding/:path*",
      ].map((source) => ({
        source,
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0",
          },
        ],
      })),
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
