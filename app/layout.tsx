import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/auth-provider";
import { MobileCalendarSwipe } from "@/components/calendar/mobile-calendar-swipe";
import { PwaRegister } from "@/components/pwa/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-covie-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Covie", template: "%s · Covie" },
  description:
    "A bright, simple shared organiser for co-parenting schedules, expenses, responsibilities and agreements.",
  applicationName: "Covie",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Covie",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}>
        <AuthProvider>{children}</AuthProvider>
        <MobileCalendarSwipe />
        <PwaRegister />
      </body>
    </html>
  );
}
