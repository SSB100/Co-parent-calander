import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: { default: "Co-parent Calendar", template: "%s · Co-parent Calendar" },
  description: "A calm, shared calendar for co-parenting schedules.",
  applicationName: "Co-parent Calendar",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Co-parent Calendar",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider>{children}</AuthProvider>
        <MobileCalendarSwipe />
        <PwaRegister />
      </body>
    </html>
  );
}
