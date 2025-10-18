"use client";

import { ConnectionsPanel } from "@/components/connections-panel";

export default function LinkPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Link your WhatsApp</h1>
        <p className="text-sm text-slate-500">
          Scan the QR to authorise this browser with WhatsApp Web. Sessions expire after seven idle days.
        </p>
      </div>
      <ConnectionsPanel />
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <strong>Reminder:</strong> This prototype is for opt-in cohorts only. Respect WhatsApp daily send limits and un-link when finished.
      </div>
    </div>
  );
}
