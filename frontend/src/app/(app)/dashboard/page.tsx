"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/auth-context";
import { apiClient } from "@/lib/api-client";
import type { Campaign, Session, WalletSummary } from "@/types/api";

dayjs.extend(relativeTime);

const fetchWallet = async () => {
  const { data } = await apiClient.get<WalletSummary>("/wallet");
  return data;
};

const fetchSession = async () => {
  const { data } = await apiClient.get<Session>("/wa/session");
  return data;
};

const fetchCampaigns = async () => {
  const { data } = await apiClient.get<Campaign[]>("/campaigns");
  return data;
};

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: fetchWallet });
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: fetchSession, refetchInterval: 5000 });
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns, refetchInterval: 10000 });

  const activeCampaigns = useMemo(
    () => (campaigns ?? []).filter((campaign) => ["queued", "sending", "paused"].includes(campaign.status)),
    [campaigns],
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
          <p className="text-sm uppercase tracking-wide text-slate-200">Balance</p>
          <h2 className="mt-3 text-3xl font-semibold">{wallet?.balance ?? 0} pts</h2>
          <p className="mt-2 text-sm text-slate-300">{wallet?.points_per_recipient ?? 2} pts per recipient</p>
          <p className="mt-2 text-xs text-slate-200">
            Expiring coins: {wallet?.expiring_points ?? 0}
            {wallet?.next_expiry_at ? ` (next ${dayjs(wallet.next_expiry_at).fromNow()})` : ""}
          </p>
          <Link href="/billing/wallet" className="mt-5 inline-flex items-center text-sm font-semibold text-white/90 hover:underline">
            Manage wallet →
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-slate-500">Session Status</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">{session?.status ?? "waiting"}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {session?.status === "linked"
              ? `Linked ${session?.last_seen_at ? dayjs(session.last_seen_at).fromNow() : "recently"}`
              : "Scan the QR on the Link WhatsApp page"}
          </p>
          <Link href="/link" className="mt-5 inline-flex items-center text-sm font-semibold text-slate-900 hover:underline">
            Link session →
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-slate-500">Limits</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            {wallet?.max_daily_recipients ?? 0} / day
          </h2>
          <p className="mt-2 text-sm text-slate-500">{wallet?.max_campaign_recipients ?? 0} recipients per campaign</p>
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
          {activeCampaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No active campaigns. Create one to start messaging.
            </div>
          ) : (
            activeCampaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <h3 className="text-base font-semibold text-slate-900">{campaign.name}</h3>
                <p className="mt-2 text-sm text-slate-500">Status: {campaign.status}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Created {dayjs(campaign.created_at).fromNow()} • Template variables: {campaign.template_variables.join(", ") || "none"}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Next steps</h2>
        <ol className="list-decimal space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 marker:text-slate-400">
          <li>Confirm all contacts are consented opt-in recipients.</li>
          <li>Keep campaigns under the {wallet?.max_campaign_recipients ?? 200} recipient cap.</li>
          <li>Respect the automation schedule in {user?.timezone ?? "UTC"}.</li>
        </ol>
      </section>
    </div>
  );
}
