"use client";

import { useMemo, useState } from "react";

import type { WalletSummary } from "@/types/api";

type WalletCardProps = {
  summary: WalletSummary | undefined;
  onTopup: (payload: { plan_type?: string | null; points?: number | null; expires_in_days?: number | null }) => Promise<void>;
  onPurchaseCoins: (points: number) => Promise<void>;
  onGrant: (payload: { user_email: string; points: number; expires_in_days?: number | null }) => Promise<void>;
};

const plans = [
  { id: "15d", label: "15-day booster", description: "1000 pts, renew in 15 days" },
  { id: "30d", label: "30-day booster", description: "2000 pts, renew in 30 days" },
];
const expiryOptions = [5, 15, 30];

export const WalletCard = ({ summary, onTopup, onPurchaseCoins, onGrant }: WalletCardProps) => {
  const [customPoints, setCustomPoints] = useState(200);
  const [coinPoints, setCoinPoints] = useState(200);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPoints, setGrantPoints] = useState(200);
  const [manualExpiry, setManualExpiry] = useState<number>(30);
  const [grantExpiry, setGrantExpiry] = useState<number>(30);
  const [message, setMessage] = useState<string | null>(null);
  const isPointsAdmin = summary?.can_allocate_points === true;

  const supportInfo = useMemo(() => {
    if (!summary?.support_whatsapp_number) {
      return { display: null, link: null };
    }
    const digits = summary.support_whatsapp_number.replace(/[^\d]/g, "");
    const display = summary.support_whatsapp_number.startsWith("+")
      ? summary.support_whatsapp_number
      : `+${summary.support_whatsapp_number}`;
    return {
      display,
      link: digits ? `https://wa.me/${digits}` : null,
    };
  }, [summary?.support_whatsapp_number]);

  const showEmptyBalanceNotice = (summary?.balance ?? 0) <= 0;

  const handlePlan = async (planType: string) => {
    await onTopup({ plan_type: planType, points: null });
    setMessage(`Plan ${planType} activated`);
  };

  const handlePoints = async () => {
    await onTopup({ plan_type: null, points: customPoints, expires_in_days: manualExpiry });
    setMessage(`Added ${customPoints} points (expires in ${manualExpiry} days)`);
  };

  const handleCoins = async () => {
    await onPurchaseCoins(coinPoints);
    setMessage(`Purchased ${coinPoints} coins (expires in 30 days)`);
  };

  const handleGrant = async () => {
    if (!grantEmail) {
      setMessage("Please provide a recipient email");
      return;
    }
    await onGrant({ user_email: grantEmail, points: grantPoints, expires_in_days: grantExpiry });
    setMessage(`Granted ${grantPoints} pts to ${grantEmail} (expires in ${grantExpiry} days)`);
    setGrantEmail("");
  };

  return (
    <div className="space-y-4">
      {showEmptyBalanceNotice ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Wallet balance is empty. Contact Pandu to top up your account before starting a campaign.
          {supportInfo.link ? (
            <>
              {" "}
              <a href={supportInfo.link} target="_blank" rel="noreferrer" className="font-semibold underline">
                WhatsApp Pandu ({supportInfo.display})
              </a>
              .
            </>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
          <p className="text-sm uppercase tracking-wide text-slate-200">Wallet balance</p>
          <h2 className="mt-3 text-3xl font-semibold">{summary?.balance ?? 0} pts</h2>
          <p className="mt-2 text-sm text-slate-300">
            {summary?.points_per_recipient ?? 2} pts per recipient • {summary?.max_daily_recipients ?? 0} / day cap
          </p>
          {summary?.plan_expires_at ? (
            <p className="mt-3 text-xs text-emerald-200">
              Plan valid until {new Date(summary.plan_expires_at).toLocaleString()}
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-300">No active subscription. Auto-responses pause when expired.</p>
          )}
          <p className="mt-3 text-xs text-slate-200">
            Expiring coins: {summary?.expiring_points ?? 0}
            {summary?.next_expiry_at ? ` (next expiry ${new Date(summary.next_expiry_at).toLocaleString()})` : ""}
          </p>
          {supportInfo.display ? (
            <p className="mt-4 text-xs text-slate-200">
              Need help?{" "}
              {supportInfo.link ? (
                <a href={supportInfo.link} target="_blank" rel="noreferrer" className="font-semibold underline">
                  WhatsApp Pandu ({supportInfo.display})
                </a>
              ) : (
                <>Contact Pandu at {supportInfo.display}</>
              )}
            </p>
          ) : null}
        </div>
        <div className="space-y-4">
          {isPointsAdmin ? (
            <>
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
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
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
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600" htmlFor="manual-expiry">
                      Expires in
                    </label>
                    <select
                      id="manual-expiry"
                      value={manualExpiry}
                      onChange={(event) => setManualExpiry(Number(event.target.value))}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    >
                      {expiryOptions.map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Manual top-ups expire automatically after the selected window.
                </p>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
                <h3 className="text-sm font-semibold text-indigo-900">Buy coins (30-day expiry)</h3>
                <p className="mt-1 text-xs text-indigo-700">
                  Coins are deducted first and disappear automatically 30 days after purchase.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={coinPoints}
                    onChange={(event) => setCoinPoints(Number(event.target.value))}
                    className="w-28 rounded-lg border border-indigo-200 px-3 py-2 shadow-sm focus:border-indigo-400 focus:outline-none"
                  />
                  <button
                    onClick={handleCoins}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    Buy coins
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <h3 className="text-sm font-semibold text-emerald-900">Grant points to a user</h3>
                <p className="mt-1 text-xs text-emerald-700">
                  Use this when onboarding new accounts or applying manual adjustments.
                </p>
                <div className="mt-3 space-y-2">
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={grantEmail}
                    onChange={(event) => setGrantEmail(event.target.value)}
                    className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={grantPoints}
                      onChange={(event) => setGrantPoints(Number(event.target.value))}
                      className="w-28 rounded-lg border border-emerald-200 px-3 py-2 shadow-sm focus:border-emerald-400 focus:outline-none"
                    />
                    <button
                      onClick={handleGrant}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                      disabled={!grantEmail}
                    >
                      Grant points
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-emerald-700" htmlFor="grant-expiry">
                      Expires in
                    </label>
                    <select
                      id="grant-expiry"
                      value={grantExpiry}
                      onChange={(event) => setGrantExpiry(Number(event.target.value))}
                      className="rounded-lg border border-emerald-200 px-2 py-1 text-sm text-emerald-900 focus:border-emerald-400 focus:outline-none"
                    >
                      {expiryOptions.map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              <h3 className="text-sm font-semibold text-slate-900">Need more points?</h3>
              <p className="mt-2">
                Wallet adjustments are handled by the support team. Reach out to Pandu on WhatsApp to purchase message
                coins or request a top-up.
              </p>
              {supportInfo.link ? (
                <a
                  href={supportInfo.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center text-sm font-semibold text-slate-900 underline"
                >
                  WhatsApp Pandu ({supportInfo.display})
                </a>
              ) : null}
            </div>
          )}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        </div>
      </div>
    </div>
  );
};
