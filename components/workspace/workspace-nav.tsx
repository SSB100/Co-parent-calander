"use client";

import {
  CalendarDays,
  House,
  LayoutDashboard,
  ListChecks,
  LogOut,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export type WorkspaceSection =
  | "home"
  | "calendar"
  | "expenses"
  | "responsibilities"
  | "kids";

const items: Array<{
  key: WorkspaceSection | "calendars";
  href: string;
  label: string;
  icon: typeof House;
}> = [
  { key: "home", href: "/home", label: "Home", icon: House },
  { key: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays },
  { key: "expenses", href: "/expenses", label: "Expenses", icon: WalletCards },
  {
    key: "responsibilities",
    href: "/responsibilities",
    label: "Responsibilities",
    icon: ListChecks,
  },
  { key: "kids", href: "/kids", label: "Kids", icon: UsersRound },
  {
    key: "calendars",
    href: "/dashboard",
    label: "Calendars",
    icon: LayoutDashboard,
  },
];

export function WorkspaceNav({
  active,
  actions,
}: {
  active?: WorkspaceSection;
  actions?: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={
              selected
                ? "inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 text-sm font-semibold text-slate-900"
                : "inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            }
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
      {actions}
      <button
        type="button"
        onClick={() =>
          void authClient.signOut().then(() => router.push("/"))
        }
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Log out
      </button>
    </div>
  );
}
