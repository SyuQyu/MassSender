"use client";

import { notFound, useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ProgressBoard } from "@/components/progress-board";
import { apiClient } from "@/lib/api-client";
import type { Campaign, CampaignProgress } from "@/types/api";

const fetchCampaign = async (id: string) => {
  const { data } = await apiClient.get<Campaign>(`/campaigns/${id}`);
  return data;
};

const fetchProgress = async (id: string) => {
  const { data } = await apiClient.get<CampaignProgress>(`/campaigns/${id}/progress`);
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

  const actionMutation = useMutation({
    mutationFn: async (action: "start" | "pause" | "resume" | "cancel") => {
      const { data } = await apiClient.post(`/campaigns/${id}/${action}`);
      return data;
    },
    onSuccess: () => void refetch(),
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
          <p className="font-medium text-slate-900">Throttle</p>
          <p className="text-sm">
            {campaign.throttle_min_seconds} - {campaign.throttle_max_seconds}s jitter
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
    </div>
  );
}
