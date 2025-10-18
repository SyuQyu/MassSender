"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QRCodePanel } from "@/components/qr-code-panel";
import { apiClient } from "@/lib/api-client";
import type { Session } from "@/types/api";

const fetchSessions = async () => {
  const { data } = await apiClient.get<Session[]>("/wa/sessions");
  return data;
};

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
};

const Modal = ({ title, children, onClose }: ModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-800"
        >
          Close
        </button>
      </div>
      <div className="mt-4 space-y-4 text-sm text-slate-600">{children}</div>
    </div>
  </div>
);

const STATUS_STYLES: Record<string, { dot: string; label: string; bg: string; border: string }> = {
  linked: {
    dot: "bg-emerald-500",
    label: "Linked",
    bg: "border-emerald-200 bg-emerald-50",
    border: "border-emerald-200",
  },
  waiting: {
    dot: "bg-amber-500",
    label: "Waiting",
    bg: "border-amber-200 bg-amber-50",
    border: "border-amber-200",
  },
  expired: {
    dot: "bg-slate-400",
    label: "Expired",
    bg: "border-slate-200 bg-slate-50",
    border: "border-slate-200",
  },
  error: {
    dot: "bg-rose-500",
    label: "Error",
    bg: "border-rose-200 bg-rose-50",
    border: "border-rose-200",
  },
};

const statusStyle = (status: string) => STATUS_STYLES[status] ?? STATUS_STYLES.error;

export const ConnectionsPanel = () => {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("Primary");
  const [createColor, setCreateColor] = useState("#4f46e5");
  const [renameTarget, setRenameTarget] = useState<Session | null>(null);
  const [renameLabel, setRenameLabel] = useState("");

  const {
    data: sessions,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["wa", "sessions"],
    queryFn: fetchSessions,
    refetchInterval: 10000,
  });

  const orderedSessions = useMemo(() => {
    return (sessions ?? []).slice().sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [sessions]);

  const activeSession = useMemo(
    () => orderedSessions.find((session) => session.id === activeSessionId) ?? null,
    [orderedSessions, activeSessionId],
  );

  const createMutation = useMutation({
    mutationFn: async ({ label, avatarColor }: { label: string; avatarColor?: string }) => {
      const payload: Record<string, unknown> = { label };
      if (avatarColor) payload.avatar_color = avatarColor;
      const { data } = await apiClient.post<Session>("/wa/sessions", payload);
      return data;
    },
    onSuccess: (session) => {
      setErrorMessage(null);
      setCreateOpen(false);
      setCreateLabel("Connection");
      setCreateColor("#4f46e5");
      setActiveSessionId(session.id);
      setViewerOpen(true);
      queryClient.setQueryData(["wa", "sessions"], (previous?: Session[]) => {
        if (!previous) return [session];
        const existing = previous.filter((item) => item.id !== session.id);
        return [session, ...existing];
      });
    },
    onError: (error: unknown) => {
      if (typeof error === "object" && error && "response" in error) {
        const anyError = error as { response?: { status?: number; data?: { detail?: string } } };
        if (anyError.response?.status === 409) {
          setErrorMessage(anyError.response.data?.detail ?? "Maximum sessions reached");
          return;
        }
      }
      setErrorMessage("Unable to create connection. Ensure the worker is online.");
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { data } = await apiClient.patch<Session>(`/wa/sessions/${id}`, { label });
      return data;
    },
    onSuccess: (session) => {
      setRenameTarget(null);
      setRenameLabel("");
      queryClient.setQueryData(["wa", "sessions"], (previous?: Session[]) => {
        if (!previous) return [session];
        return previous.map((item) => (item.id === session.id ? session : item));
      });
    },
    onError: () => setErrorMessage("Failed to rename connection"),
  });

  const refreshMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data } = await apiClient.post<Session>(`/wa/sessions/${sessionId}/refresh`, {});
      return data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(["wa", "sessions"], (previous?: Session[]) => {
        if (!previous) return [session];
        return previous.map((item) => (item.id === session.id ? session : item));
      });
    },
  });
  const refreshPending = refreshMutation.isPending;
  const refreshSession = refreshMutation.mutate;

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiClient.delete(`/wa/sessions/${sessionId}`);
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.setQueryData(["wa", "sessions"], (previous?: Session[]) => {
        if (!previous) return [];
        return previous.filter((item) => item.id !== sessionId);
      });
      if (sessionId === activeSessionId) {
        setActiveSessionId(null);
        setViewerOpen(false);
      }
    },
    onError: () => setErrorMessage("Failed to delete session. Is the worker reachable?"),
  });

  useEffect(() => {
    if (!viewerOpen || !activeSessionId) {
      return;
    }
    const interval = setInterval(() => {
      if (!refreshPending) {
        refreshSession(activeSessionId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [viewerOpen, activeSessionId, refreshPending, refreshSession]);

  const handleCreate = () => {
    if (!createLabel.trim()) {
      setErrorMessage("Label is required");
      return;
    }
    createMutation.mutate({ label: createLabel.trim(), avatarColor: createColor || undefined });
  };

  const handleRename = () => {
    if (!renameTarget) return;
    if (!renameLabel.trim()) {
      setErrorMessage("Label is required");
      return;
    }
    renameMutation.mutate({ id: renameTarget.id, label: renameLabel.trim() });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Connections</h2>
            <p className="text-sm text-slate-500">
              Manage WhatsApp Web sessions. Track health, regenerate QR codes, or remove idle devices.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => refetch()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-70"
              disabled={isFetching}
            >
              {isFetching ? "Refreshing…" : "Refresh list"}
            </button>
            <button
              onClick={() => {
                setCreateOpen(true);
                setCreateLabel(`Connection ${(sessions?.length ?? 0) + 1}`);
              }}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-70"
              disabled={(sessions?.length ?? 0) >= 5}
            >
              Add connection
            </button>
          </div>
        </div>
        {errorMessage ? <p className="mt-3 text-sm text-rose-600">{errorMessage}</p> : null}
        <div className="mt-4 space-y-3">
          {orderedSessions.length ? (
            orderedSessions.map((session) => {
              const style = statusStyle(session.status);
              const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).toLocaleString() : "Never";
              const expires = session.expires_at ? new Date(session.expires_at).toLocaleString() : null;
              return (
                <div
                  key={session.id}
                  className={`flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between ${style.border}`}
                >
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 flex-shrink-0 rounded-full ${style.dot}`} />
                      {session.avatar_color ? (
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full border border-white shadow"
                          style={{ backgroundColor: session.avatar_color }}
                          aria-label="Avatar colour"
                        />
                      ) : null}
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{session.label}</p>
                        <p className="text-xs text-slate-500">
                          Status: {style.label}
                          {session.last_error_message ? ` · ${session.last_error_message}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          Last seen {lastSeen}
                          {expires ? ` · Expires ${expires}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                      <p>Device: {session.device_name ?? "—"}</p>
                      <p>Priority: {session.priority}</p>
                      <p>
                        Linked devices:
                        {session.linked_devices.length ? (
                          <span className="ml-1 text-slate-600">{session.linked_devices.join(", ")}</span>
                        ) : (
                          <span className="ml-1 text-slate-400">None</span>
                        )}
                      </p>
                      <p>Last QR: {session.last_qr_at ? new Date(session.last_qr_at).toLocaleString() : "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                      onClick={() => {
                        setRenameTarget(session);
                        setRenameLabel(session.label);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => refreshSession(session.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                      disabled={refreshPending}
                    >
                      Refresh status
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(session.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:border-rose-300 disabled:opacity-60"
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
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
            refreshSession(activeSessionId);
          }}
          refreshing={refreshPending}
          onClose={() => setViewerOpen(false)}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No QR code selected. Choose a connection or add a new one to display the scanner.
        </div>
      )}

      {createOpen ? (
        <Modal title="Add connection" onClose={() => setCreateOpen(false)}>
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            Label
            <input
              value={createLabel}
              onChange={(event) => setCreateLabel(event.target.value)}
              placeholder="Team phone"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            Accent colour (optional)
            <input
              value={createColor}
              onChange={(event) => setCreateColor(event.target.value)}
              placeholder="#4f46e5"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <button
            onClick={handleCreate}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating…" : "Create connection"}
          </button>
        </Modal>
      ) : null}

      {renameTarget ? (
        <Modal title="Rename connection" onClose={() => setRenameTarget(null)}>
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            Label
            <input
              value={renameLabel}
              onChange={(event) => setRenameLabel(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <button
            onClick={handleRename}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={renameMutation.isPending}
          >
            {renameMutation.isPending ? "Saving…" : "Save"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
};
