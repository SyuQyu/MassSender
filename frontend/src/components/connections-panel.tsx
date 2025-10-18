"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { QRCodePanel } from "@/components/qr-code-panel";
import { apiClient } from "@/lib/api-client";
import type { Session } from "@/types/api";

const fetchSessions = async () => {
  const { data } = await apiClient.get<Session[]>("/wa/sessions");
  return data;
};

export const ConnectionsPanel = () => {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: sessions,
    refetch: refetchSessions,
    isFetching: sessionsLoading,
  } = useQuery({
    queryKey: ["wa", "sessions"],
    queryFn: fetchSessions,
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<Session>("/wa/sessions", {});
      return data;
    },
    onSuccess: (session) => {
      setError(null);
      setActiveSessionId(session.id);
      setViewerOpen(true);
      queryClient.setQueryData(["wa", "sessions"], (previous?: Session[]) => {
        if (!previous) return [session];
        const existing = previous.find((item) => item.id === session.id);
        if (existing) {
          return previous.map((item) => (item.id === session.id ? session : item));
        }
        return [session, ...previous];
      });
      void refetchSessions();
    },
    onError: () => {
      setError("Unable to create connection. Ensure the WhatsApp worker is running.");
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (sessionId: string) => apiClient.post<Session>(`/wa/sessions/${sessionId}/refresh`, {}),
    onSuccess: (session) => {
      queryClient.setQueryData(["wa", "sessions"], (previous?: Session[]) => {
        if (!previous) return [session];
        return previous.map((item) => (item.id === session.id ? session : item));
      });
      void refetchSessions();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => apiClient.delete(`/wa/sessions/${sessionId}`),
    onSuccess: (_data, sessionId) => {
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setViewerOpen(false);
      }
      void refetchSessions();
    },
  });

  const activeSession = useMemo(
    () => sessions?.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Connections</h2>
            <p className="text-sm text-slate-500">
              Manage WhatsApp Web sessions. QR codes appear only after you add a connection.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-70"
              disabled={createMutation.isLoading}
            >
              {createMutation.isLoading ? "Preparing…" : "Add connection"}
            </button>
            <button
              onClick={() => refetchSessions()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-70"
              disabled={sessionsLoading}
            >
              Refresh list
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 space-y-3">
          {sessions?.length ? (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Session {session.id.slice(0, 8)} · {session.status}
                  </p>
                  <p className="text-xs text-slate-500">
                    Created {new Date(session.created_at).toLocaleString()}
                    {session.last_seen_at ? ` · Last seen ${new Date(session.last_seen_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setActiveSessionId(session.id);
                      setViewerOpen(true);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  >
                    View QR
                  </button>
                  <button
                    onClick={() => refreshMutation.mutate(session.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                    disabled={refreshMutation.isLoading}
                  >
                    Refresh status
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(session.id)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:border-rose-300 disabled:opacity-60"
                    disabled={deleteMutation.isLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No connections yet. Click “Add connection” to generate a QR code.</p>
          )}
        </div>
      </section>

      {viewerOpen ? (
        <QRCodePanel
          session={activeSession}
          onRefresh={() => {
            if (!activeSessionId) return;
            refreshMutation.mutate(activeSessionId);
          }}
          refreshing={refreshMutation.isLoading}
          onClose={() => setViewerOpen(false)}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No QR code selected. Choose a connection or add a new one to display the scanner.
        </div>
      )}
    </div>
  );
};
