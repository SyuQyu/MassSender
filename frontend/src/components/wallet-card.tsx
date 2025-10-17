"use client";

import { useState } from "react";

import type { WalletSummary } from "@/types/api";

type WalletCardProps = {
  summary: WalletSummary | undefined;
  onTopup: (payload: { plan_type?: string | null; points?: number | null }) => Promise<void>;
};

const plans = [
  { id: "15d", label: "15-day booster", description: "1000 pts, renew in 15 days" },
  { id: "30d", label: "30-day booster", description: "2000 pts, renew in 30 days" },
];

export const WalletCard = ({ summary, onTopup }: WalletCardProps) => {
  const [customPoints, setCustomPoints] = useState(200);
  const [message, setMessage] = useState<string | null>(null);

  const handlePlan = async (planType: string) => {
    await onTopup({ plan_type: planType, points: null });
    setMessage(`Plan ${planType} activated`);
  };

  const handlePoints = async () => {
    await onTopup({ plan_type: null, points: customPoints });
    setMessage(`Added ${customPoints} points`);
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
        <p className="text-sm uppercase tracking-wide text-slate-200">Wallet balance</p>
        <h2 className="mt-3 text-3xl font-semibold">{summary?.balance ?? 0} pts</h2>
        <p className="mt-2 text-sm text-slate-300">
          {summary?.points_per_recipient ?? 2} pts per recipient • {summary?.max_daily_recipients ?? 0} / day cap
        </p>
        {summary?.plan_expires_at ? (
          <p className="mt-3 text-xs text-emerald-200">Plan valid until {new Date(summary.plan_expires_at).toLocaleString()}</p>
        ) : (
          <p className="mt-3 text-xs text-slate-300">No active subscription. Auto-responses paused when expired.</p>
        )}
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-semibold text-slate-900">Top up with a plan</h3>
          <div className="mt-3 grid gap-3">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => handlePlan(plan.id)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:border-slate-300"
              >
                <span>{plan.label}</span>
                <p className="text-xs font-normal text-slate-500">{plan.description}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-semibold text-slate-900">Manual points</h3>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              min={1}
              value={customPoints}
              onChange={(event) => setCustomPoints(Number(event.target.value))}
              className="w-28 rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
            <button
              onClick={handlePoints}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add points
            </button>
          </div>
        </div>
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      </div>
    </div>
  );
};
