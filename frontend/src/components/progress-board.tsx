"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { API_URL, apiClient, getAccessToken, loadTokens } from "@/lib/api-client";
import type { CampaignProgress, CampaignRecipient } from "@/types/api";

const fetchRecipients = async (campaignId: string) => {
  const { data } = await apiClient.get<CampaignRecipient[]>(`/campaigns/${campaignId}/recipients`);
  return data;
};

const deriveWsUrl = (campaignId: string, token: string) => {
  const base = API_URL.replace(/^http/, "ws").replace(/\/api$/, "");
  return `${base}/api/campaigns/ws/${campaignId}?token=${token}`;
};

type Progress = CampaignProgress & { status: string };

export const ProgressBoard = ({ campaignId }: { campaignId: string }) => {
  const [progress, setProgress] = useState<Progress | null>(null);

  const { data: recipients, refetch } = useQuery({
    queryKey: ["campaign", campaignId, "recipients"],
    queryFn: () => fetchRecipients(campaignId),
    enabled: Boolean(campaignId),
  });

  useEffect(() => {
    const token = getAccessToken() ?? loadTokens()?.access_token;
    if (!campaignId || !token) return;
    const ws = new WebSocket(deriveWsUrl(campaignId, token));
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data) as Progress;
      setProgress(payload);
      void refetch();
    };
    ws.onerror = () => {
      console.warn("WebSocket error");
    };
    return () => ws.close();
  }, [campaignId, refetch]);

  const totals = useMemo(() => {
    if (progress) return progress;
    const total = recipients?.length ?? 0;
    return {
      total,
      queued: recipients?.filter((r) => r.status === "queued").length ?? 0,
      sending: recipients?.filter((r) => r.status === "sending").length ?? 0,
      sent: recipients?.filter((r) => r.status === "sent").length ?? 0,
      failed: recipients?.filter((r) => r.status === "failed").length ?? 0,
      read: recipients?.filter((r) => r.status === "read").length ?? 0,
      status: "unknown",
    } satisfies Progress;
  }, [progress, recipients]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {["queued", "sending", "sent", "failed", "read"].map((key) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">{key}</p>
            <p className="text-2xl font-semibold text-slate-900">{Number(totals[key as keyof Progress] ?? 0)}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Recipient</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Attempts</th>
              <th className="px-4 py-2">Last error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recipients?.map((recipient) => (
              <tr key={recipient.id} className="bg-white">
                <td className="px-4 py-2">
                  <p className="font-medium text-slate-900">{recipient.name ?? recipient.phone_e164}</p>
                  <p className="text-xs text-slate-500">{recipient.phone_e164}</p>
                </td>
                <td className="px-4 py-2 capitalize text-slate-600">{recipient.status}</td>
                <td className="px-4 py-2 text-slate-600">{recipient.attempts}</td>
                <td className="px-4 py-2 text-xs text-rose-500">{recipient.last_error ?? ""}</td>
              </tr>
            )) ?? (
              <tr>
                <td className="px-4 py-2 text-sm text-slate-500" colSpan={4}>
                  No recipients yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
