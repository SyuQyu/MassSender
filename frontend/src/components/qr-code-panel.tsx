"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type { Session } from "@/types/api";

type QRCodePanelProps = {
  session: Session | null;
  onRefresh: () => void;
  refreshing?: boolean;
  onClose?: () => void;
};

const PANEL_STYLES: Record<string, { frame: string; badge: string; accent: string }> = {
  linked: {
    frame: "border-emerald-300",
    badge: "bg-emerald-100 text-emerald-700",
    accent: "text-emerald-600",
  },
  waiting: {
    frame: "border-amber-300",
    badge: "bg-amber-100 text-amber-700",
    accent: "text-amber-600",
  },
  expired: {
    frame: "border-slate-200",
    badge: "bg-slate-100 text-slate-600",
    accent: "text-slate-500",
  },
  error: {
    frame: "border-rose-300",
    badge: "bg-rose-100 text-rose-700",
    accent: "text-rose-600",
  },
};

export const QRCodePanel = ({ session, onRefresh, refreshing = false, onClose }: QRCodePanelProps) => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.status !== "waiting" || !session.expires_at) {
      setTimeLeft(null);
      return;
    }
    const expiry = new Date(session.expires_at).getTime();
    const update = () => {
      const diff = expiry - Date.now();
      if (diff <= 0) {
        setTimeLeft("expired");
      } else {
        setTimeLeft(`${Math.max(1, Math.round(diff / 1000))}s`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session?.status, session?.expires_at]);

  const qrSrc = useMemo(() => (session?.qr_png ? `data:image/png;base64,${session.qr_png}` : null), [session?.qr_png]);
  const style = session ? PANEL_STYLES[session.status] ?? PANEL_STYLES.error : PANEL_STYLES.expired;

  const statusLabel = useMemo(() => {
    switch (session?.status) {
      case "linked":
        return "Linked";
      case "waiting":
        return "Waiting for scan";
      case "expired":
        return "Expired";
      case "error":
        return "Error";
      default:
        return "Unknown";
    }
  }, [session?.status]);

  return (
    <div className={`rounded-2xl border-2 bg-white p-6 shadow-sm ${style.frame}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Scan with WhatsApp Mobile</h2>
          <p className="text-sm text-slate-500">
            Open WhatsApp → Settings → Linked devices → Link a device. Keep the device awake until status changes to linked.
          </p>
        </div>
        {onClose ? (
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-800"
          >
            Close
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex flex-col items-start gap-6 lg:flex-row lg:items-center">
        <div className={`flex h-60 w-60 items-center justify-center rounded-xl border-2 border-dashed ${style.frame} bg-slate-50`}>
          {qrSrc ? (
            <Image src={qrSrc} alt="WhatsApp QR" width={220} height={220} className="rounded-lg border border-slate-200" />
          ) : (
            <span className="text-sm text-slate-500">
              {session ? (
                session.status === "linked" ? (
                  <span className="font-semibold text-emerald-600">Device linked ✅</span>
                ) : session.status === "waiting" ? (
                  "Waiting for QR from WhatsApp…"
                ) : session.status === "error" ? (
                  session.last_error_message ?? "Session error"
                ) : (
                  "No connection selected"
                )
              ) : (
                "No connection selected"
              )}
            </span>
          )}
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          {session ? (
            <>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${style.badge}`}>
                <span className="h-2 w-2 rounded-full bg-current" />
                {statusLabel}
                {session.status === "waiting" && timeLeft ? (
                  <span className="font-normal">({timeLeft === "expired" ? "QR expired" : `expires in ${timeLeft}`})</span>
                ) : null}
              </span>
              <p>
                <span className="font-medium text-slate-900">Label:</span> {session.label}
              </p>
              <p>
                <span className="font-medium text-slate-900">Last seen:</span> {session.last_seen_at ? new Date(session.last_seen_at).toLocaleString() : "Never"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Last QR:</span> {session.last_qr_at ? new Date(session.last_qr_at).toLocaleString() : "—"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Linked devices:</span>{" "}
                {session.linked_devices.length ? session.linked_devices.join(", ") : "None"}
              </p>
              {session.last_error_message ? (
                <p className="text-xs text-rose-600">Last error: {session.last_error_message}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={onRefresh}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing…" : "Refresh status"}
                </button>
                {session.status === "waiting" ? (
                  <p className={`text-xs ${style.accent}`}>Keep the phone camera on the QR until the status switches to linked.</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select or create a connection to display the QR code.</p>
          )}
        </div>
      </div>
    </div>
  );
};
