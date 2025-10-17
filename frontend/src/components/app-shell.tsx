"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

import { useAuth } from "@/contexts/auth-context";
import { clsx } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/link", label: "Link WhatsApp" },
  { href: "/contacts/upload", label: "Upload Contacts" },
  { href: "/contacts/group", label: "Group Import" },
  { href: "/campaigns/new", label: "New Campaign" },
  { href: "/automation/rules", label: "Automation" },
  { href: "/settings/schedule", label: "Active Hours" },
  { href: "/billing/wallet", label: "Wallet" },
];

export const AppShell = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            MassSender Control Center
          </h1>
          <p className="text-sm text-slate-500">
            Safely coordinate opt-in WhatsApp campaigns and automations.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <p className="font-medium text-slate-900">{user?.full_name ?? user?.email}</p>
            <p className="text-xs text-slate-500">{user?.timezone}</p>
          </div>
          <button
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-slate-900 text-white shadow"
                  : "bg-white text-slate-600 shadow-sm hover:bg-slate-100",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {children}
      </main>
    </div>
  );
};
