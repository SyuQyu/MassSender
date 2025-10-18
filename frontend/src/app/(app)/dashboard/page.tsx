"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/auth-context";
import { apiClient } from "@/lib/api-client";
import type { ActiveCampaignSummary, Campaign, Session, WalletSummary } from "@/types/api";

dayjs.extend(relativeTime);

const fetchWallet = async () => {
  const { data } = await apiClient.get<WalletSummary>("/wallet");
  return data;
};

const fetchSessions = async () => {
  const { data } = await apiClient.get<Session[]>("/wa/sessions");
  return data;
};

const fetchActiveCampaigns = async () => {
  const { data } = await apiClient.get<ActiveCampaignSummary[]>("/campaigns/active");
  return data;
};

const fetchCampaigns = async () => {
  const { data } = await apiClient.get<Campaign[]>("/campaigns");
  return data;
};

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: fetchWallet });
  const { data: sessions } = useQuery({ queryKey: ["wa", "sessions"], queryFn: fetchSessions, refetchInterval: 5000 });
  const { data: activeCampaigns } = useQuery({
    queryKey: ["campaigns", "active"],
    queryFn: fetchActiveCampaigns,
    refetchInterval: 5000,
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: fetchCampaigns,
    staleTime: 60_000,
  });

  const primarySession = sessions?.[0] ?? null;

  const activeList = activeCampaigns ?? [];

  const historyList = useMemo(() => {
    if (!campaigns) return [];
    const inactiveStatuses = new Set(["completed", "failed", "cancelled", "draft"]);
    return campaigns
      .filter((campaign) => inactiveStatuses.has(campaign.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [campaigns]);

  const supportInfo = useMemo(() => {
    if (!wallet?.support_whatsapp_number) {
      return null;
    }
    const digits = wallet.support_whatsapp_number.replace(/[^\d]/g, "");
    const display = wallet.support_whatsapp_number.startsWith("+")
      ? wallet.support_whatsapp_number
      : `+${wallet.support_whatsapp_number}`;
    return {
      display,
      link: digits ? `https://wa.me/${digits}` : null,
    };
  }, [wallet?.support_whatsapp_number]);

  const showLowBalanceNotice = (wallet?.balance ?? 0) <= 0;
  const formatNumber = (value: number | undefined | null) =>
    new Intl.NumberFormat().format(value ?? 0);

  return (
    <div className="space-y-8">
      {showLowBalanceNotice ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Wallet balance is empty. Top up before sending campaigns.
          {supportInfo ? (
            <>
              {" "}
              {supportInfo.link ? (
                <a href={supportInfo.link} target="_blank" rel="noreferrer" className="font-semibold underline">
                  WhatsApp Pandu ({supportInfo.display})
                </a>
              ) : (
                <>Contact Pandu at {supportInfo.display}</>
              )}
              .
            </>
          ) : null}
        </div>
      ) : null}
      <section className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-900/20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-lg">
          <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-400">
            <span aria-hidden="true">💰</span> Balance
          </p>
          <h2 className="mt-4 text-4xl font-semibold">{wallet?.balance ?? 0} pts</h2>
          <p className="mt-3 text-sm text-slate-200">{wallet?.points_per_recipient ?? 2} pts per recipient</p>
          <p className="mt-2 text-xs text-slate-300">
            Expiring coins: {wallet?.expiring_points ?? 0}
            {wallet?.next_expiry_at ? ` (next ${dayjs(wallet.next_expiry_at).fromNow()})` : ""}
          </p>
          <Link href="/billing/wallet" className="mt-5 inline-flex items-center text-sm font-semibold text-white/90 hover:underline">
            Manage wallet →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/50 p-6 shadow-sm backdrop-blur">
          <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-500">
            <span aria-hidden="true">🔗</span> Session Status
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900 capitalize">{primarySession?.status ?? "waiting"}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {primarySession?.status === "linked"
              ? `Linked ${primarySession?.last_seen_at ? dayjs(primarySession.last_seen_at).fromNow() : "recently"}`
              : "Open the Sessions page to scan a QR code"}
          </p>
          <Link href="/link" className="mt-5 inline-flex items-center text-sm font-semibold text-slate-900 hover:underline">
            Manage sessions →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm">
          <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-500">
            <span aria-hidden="true">📈</span> Limits
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            {formatNumber(wallet?.max_daily_recipients)} / day
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {formatNumber(wallet?.max_campaign_recipients)} recipients per campaign
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Active campaigns</h2>
          <Link href="/campaigns/new" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            New campaign
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {activeList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No active campaigns. Create one to start messaging.
            </div>
          ) : (
            activeList.map((campaign) => {
              const total = campaign.progress.total || 0;
              const sent = campaign.progress.sent || 0;
              const percent = total ? Math.round((sent / total) * 100) : 0;
              return (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{campaign.name}</h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {campaign.progress.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Session: {campaign.session_label ?? "Primary"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {sent} sent · {campaign.progress.failed} failed · {campaign.progress.queued} queued
                  </p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-slate-900" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{percent}% complete</p>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent campaign history</h2>
          <Link href="/campaigns" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            View all →
          </Link>
        </div>
        {historyList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            Completed campaigns will appear here once you start sending.
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {historyList.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{campaign.name}</p>
                      <p className="text-xs text-slate-500">{dayjs(campaign.created_at).fromNow()}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-600">
                      {campaign.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Session: {campaign.session_label ?? "Primary"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Variables: {campaign.template_variables.length ? campaign.template_variables.join(", ") : "None"}
                  </p>
                </Link>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <div className="max-h-64 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Session</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyList.map((campaign) => {
                      const status = campaign.status;
                      const badgeStyles =
                        status === "completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : status === "failed"
                            ? "bg-rose-100 text-rose-700"
                            : status === "cancelled"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600";
                      return (
                        <tr key={campaign.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <Link href={`/campaigns/${campaign.id}`} className="font-medium text-slate-900 hover:underline">
                              {campaign.name}
                            </Link>
                            <p className="text-xs text-slate-500">
                              {campaign.template_variables.length ? campaign.template_variables.join(", ") : "No variables"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{campaign.session_label ?? "Primary"}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${badgeStyles}`}>{status}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">
                            {dayjs(campaign.created_at).fromNow()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Next steps</h2>
        <ol className="list-decimal space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 marker:text-slate-400">
          <li>Confirm all contacts are consented opt-in recipients.</li>
          <li>Keep campaigns under the {wallet?.max_campaign_recipients ?? 200} recipient cap.</li>
          <li>Respect the automation schedule in {user?.timezone ?? "UTC"}.</li>
        </ol>
      </section>

      <footer className="py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} All rights reserved to Pandu Utomo
      </footer>
    </div>
  );
}
