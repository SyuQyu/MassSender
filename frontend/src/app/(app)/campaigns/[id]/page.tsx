"use client";

import { notFound, useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ProgressBoard } from "@/components/progress-board";
import { apiClient } from "@/lib/api-client";
import type { Campaign, CampaignProgress, WalletSummary } from "@/types/api";

const fetchCampaign = async (id: string) => {
  const { data } = await apiClient.get<Campaign>(`/campaigns/${id}`);
  return data;
};

const fetchProgress = async (id: string) => {
  const { data } = await apiClient.get<CampaignProgress>(`/campaigns/${id}/progress`);
  return data;
};

const fetchWallet = async () => {
  const { data } = await apiClient.get<WalletSummary>("/wallet");
  return data;
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) {
    notFound();
  }

  const { data: campaign, refetch } = useQuery({ queryKey: ["campaign", id], queryFn: () => fetchCampaign(id!) });
  const { data: progress } = useQuery({ queryKey: ["campaign", id, "progress"], queryFn: () => fetchProgress(id!), refetchInterval: 5000 });
  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: fetchWallet });
  const [actionError, setActionError] = useState<string | null>(null);
  const [pointsWarning, setPointsWarning] = useState<{
    required: number;
    balance: number;
    gap: number;
    support: string | null;
  } | null>(null);
  const formatNumber = (value: number) => new Intl.NumberFormat().format(Math.round(value));

  const actionMutation = useMutation({
    mutationFn: async (action: "start" | "pause" | "resume" | "cancel") => {
      const { data } = await apiClient.post(`/campaigns/${id}/${action}`);
      return data;
    },
    onSuccess: () => {
      setActionError(null);
      setPointsWarning(null);
      void refetch();
    },
    onError: (error) => {
      if (typeof error === "object" && error && "response" in error) {
        const err = error as { response?: { status?: number; data?: { detail?: string } } };
        if (err.response?.status === 422 && err.response.data?.detail?.toLowerCase()?.includes("insufficient points")) {
          const perRecipient = wallet?.points_per_recipient ?? 0;
          const recipients = progress?.total ?? 0;
          const required = recipients * perRecipient;
          const balance = wallet?.balance ?? 0;
          const gap = Math.max(0, required - balance);
          setPointsWarning({ required, balance, gap, support: wallet?.support_whatsapp_number ?? null });
          return;
        }
      }
      setActionError("Action failed. Please try again or refresh the page.");
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.get(`/campaigns/${id}/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `campaign-${id}.csv`;
      link.click();
    },
  });

  if (!campaign) {
    return <div className="text-sm text-slate-500">Loading campaign...</div>;
  }

  const status = campaign.status;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
          <p className="text-sm text-slate-500">Status: {status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => actionMutation.mutate("start")}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={actionMutation.isPending || !["draft", "paused"].includes(status)}
          >
            Start
          </button>
          <button
            onClick={() => actionMutation.mutate("pause")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            disabled={actionMutation.isPending || !["queued", "sending"].includes(status)}
          >
            Pause
          </button>
          <button
            onClick={() => actionMutation.mutate("resume")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            disabled={actionMutation.isPending || status !== "paused"}
          >
            Resume
          </button>
          <button
            onClick={() => actionMutation.mutate("cancel")}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50"
            disabled={actionMutation.isPending || ["completed", "cancelled"].includes(status)}
          >
            Cancel
          </button>
          <button
            onClick={() => exportMutation.mutate()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Export CSV
          </button>
        </div>
        {actionError ? <p className="text-sm text-rose-600">{actionError}</p> : null}
      </div>
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 md:grid-cols-2">
        <div>
          <p className="font-medium text-slate-900">Template</p>
          <p className="text-sm">{campaign.template_body}</p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Media</p>
          <p className="text-sm">{campaign.media_url ?? "No media attached"}</p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Session</p>
          <p className="text-sm">{campaign.session_label ?? "Default connection"}</p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Throttle</p>
          <p className="text-sm">
            {campaign.throttle_min_seconds} - {campaign.throttle_max_seconds}s jitter
          </p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Session</p>
          <p className="text-sm">
            {campaign.session_label ?? "Primary connection"}
            {campaign.session_id ? "" : " (auto)"}
          </p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Progress</p>
          <p className="text-sm">
            {progress ? `${progress.sent} / ${progress.total} sent (${progress.status})` : "Waiting for stats"}
          </p>
        </div>
      </div>
      <ProgressBoard campaignId={campaign.id} />

      {pointsWarning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Insufficient points</h3>
              <p className="mt-1 text-sm text-slate-600">
                This campaign needs {formatNumber(pointsWarning.required)} pts but your wallet only has {formatNumber(pointsWarning.balance)} pts.
                Gap: {formatNumber(pointsWarning.gap)} pts.
              </p>
            </div>
            {pointsWarning.support ? (
              <a
                href={`https://wa.me/${pointsWarning.support.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Contact Pandu ({pointsWarning.support})
              </a>
            ) : null}
            <div className="flex justify-end">
              <button
                onClick={() => setPointsWarning(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
