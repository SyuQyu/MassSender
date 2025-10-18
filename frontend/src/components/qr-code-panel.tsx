"use client";

import Image from "next/image";
import type { Session } from "@/types/api";

type QRCodePanelProps = {
  session: Session | null;
  onRefresh: () => void;
  refreshing?: boolean;
  onClose?: () => void;
};

export const QRCodePanel = ({ session, onRefresh, refreshing = false, onClose }: QRCodePanelProps) => {
  const qrSrc = session?.qr_png ? `data:image/png;base64,${session.qr_png}` : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Scan with WhatsApp Mobile</h2>
          <p className="text-sm text-slate-500">
            Open WhatsApp → Settings → Linked devices → Link a device to authorize this connection.
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
      <div className="mt-4 flex flex-col items-start gap-4 md:flex-row md:items-center">
        <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
          {qrSrc ? (
            <Image src={qrSrc} alt="WhatsApp QR" width={220} height={220} className="rounded-lg border border-slate-200" />
          ) : (
            <span className="text-sm text-slate-500">
              {session ? "Waiting for QR from WhatsApp…" : "No connection selected"}
            </span>
          )}
        </div>
        <div className="space-y-3">
          {session ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>Status: {session.status}</span>
                {session.expires_at ? <span>Expires {new Date(session.expires_at).toLocaleString()}</span> : null}
                {session.last_seen_at ? <span>Last seen {new Date(session.last_seen_at).toLocaleString()}</span> : null}
              </div>
              <button
                onClick={onRefresh}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "Refresh QR"}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select or create a connection to display the QR code.</p>
          )}
        </div>
      </div>
    </div>
  );
};
