"use client";

import Image from "next/image";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Session } from "@/types/api";

const fetchSession = async () => {
  const { data } = await apiClient.get<Session>("/wa/session");
  return data;
};

export const QRCodePanel = () => {
  const { data: session, refetch, isFetching } = useQuery({
    queryKey: ["session", "qr"],
    queryFn: fetchSession,
    refetchInterval: 5000,
  });

  const [error, setError] = useState<string | null>(null);

  const mockLinkMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<Session>("/wa/session/mock-link", {});
      return data;
    },
    onSuccess: () => {
      void refetch();
    },
    onError: () => setError("Unable to link session"),
  });

  const qrSrc = session?.qr_png ? `data:image/png;base64,${session.qr_png}` : null;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
        {qrSrc ? (
          <Image src={qrSrc} alt="WhatsApp QR" width={220} height={220} className="rounded-lg border border-slate-200" />
        ) : (
          <span className="text-sm text-slate-500">Waiting for QR...</span>
        )}
      </div>
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">Scan with WhatsApp Mobile</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Open WhatsApp → Settings → Linked devices</li>
          <li>Select “Link a device” and scan this QR</li>
          <li>Keep the browser session active to maintain connection</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span>Status: {session?.status ?? "waiting"}</span>
          {session?.expires_at ? <span>Expires {new Date(session.expires_at).toLocaleString()}</span> : null}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
            disabled={isFetching}
          >
            Refresh QR
          </button>
          <button
            onClick={() => mockLinkMutation.mutate()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Mock link (demo)
          </button>
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
};
