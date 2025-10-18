"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";

import { useAuth } from "@/contexts/auth-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/link", label: "Sessions" },
  { href: "/contacts/upload", label: "Upload Contacts" },
  { href: "/contacts/group", label: "Group Import" },
  { href: "/campaigns/new", label: "New Campaign" },
  { href: "/automation/rules", label: "Automation" },
  { href: "/settings/schedule", label: "Active Hours" },
  { href: "/billing/wallet", label: "Wallet" },
];

const getInitialSidebarState = () => {
  if (typeof window === "undefined") {
    return true;
  }
  const stored = window.localStorage.getItem("ms_sidebar");
  if (stored === "closed") {
    return false;
  }
  return true;
};

export const AppShell = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(getInitialSidebarState);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ms_sidebar", sidebarOpen ? "open" : "closed");
  }, [sidebarOpen]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const renderNavItems = ({
    collapsed,
    onToggle,
    onNavigate,
    toggleIcon,
  }: {
    collapsed: boolean;
    onToggle: () => void;
    onNavigate?: () => void;
    toggleIcon?: string;
  }) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <span className={`text-lg font-semibold text-slate-900 ${collapsed ? "sr-only" : "block"}`}>
          MassSender
        </span>
        <button
          onClick={onToggle}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-slate-300 hover:text-slate-900"
        >
          <span className="sr-only">Toggle navigation</span>
          {toggleIcon ?? (collapsed ? "▶" : "◀")}
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-2 pb-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const baseClasses = collapsed
            ? "flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold"
            : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold";
          const stateClasses = isActive
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100";

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`${baseClasses} transition ${stateClasses}`}
            >
              {collapsed ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {item.label.charAt(0)}
                </span>
              ) : (
                item.label
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`hidden border-r border-slate-200 bg-white shadow-sm transition-all duration-200 lg:flex ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        {renderNavItems({ collapsed: !sidebarOpen, onToggle: toggleSidebar })}
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="flex-1 bg-slate-900/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative h-full w-64 bg-white shadow-xl">
            {renderNavItems({
              collapsed: false,
              onToggle: () => setDrawerOpen(false),
              onNavigate: () => setDrawerOpen(false),
              toggleIcon: "✕",
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-slate-300 hover:text-slate-900 lg:hidden"
            >
              <span className="sr-only">Open navigation</span>☰
            </button>
            <button
              onClick={toggleSidebar}
              className="hidden rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-slate-300 hover:text-slate-900 lg:inline-flex"
            >
              <span className="sr-only">Toggle sidebar</span>
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">MassSender Control Center</h1>
              <p className="text-sm text-slate-500">Safely coordinate opt-in WhatsApp campaigns and automations.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
};
