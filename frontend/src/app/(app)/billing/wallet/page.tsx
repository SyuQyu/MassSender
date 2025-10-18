"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { WalletCard } from "@/components/wallet-card";
import { apiClient } from "@/lib/api-client";
import type { WalletGrantResult, WalletSummary, WalletTransaction } from "@/types/api";

const fetchSummary = async () => {
  const { data } = await apiClient.get<WalletSummary>("/wallet");
  return data;
};

const fetchTransactions = async () => {
  const { data } = await apiClient.get<WalletTransaction[]>("/wallet/txns");
  return data;
};

export default function WalletPage() {
  const { data: summary, refetch: refetchSummary } = useQuery({ queryKey: ["wallet"], queryFn: fetchSummary });
  const { data: transactions, refetch: refetchTransactions } = useQuery({
    queryKey: ["wallet-txns"],
    queryFn: fetchTransactions,
  });

  const mutation = useMutation({
    mutationFn: (payload: { plan_type?: string | null; points?: number | null; expires_in_days?: number | null }) =>
      apiClient.post<WalletSummary>("/wallet/topup", payload),
    onSuccess: () => {
      void refetchSummary();
      void refetchTransactions();
    },
  });

  const coinMutation = useMutation({
    mutationFn: (points: number) => apiClient.post<WalletSummary>("/wallet/coins", { points }),
    onSuccess: () => {
      void refetchSummary();
      void refetchTransactions();
    },
  });

  const grantMutation = useMutation({
    mutationFn: (payload: { user_email: string; points: number; expires_in_days?: number | null }) =>
      apiClient.post<WalletGrantResult>("/wallet/grant", payload),
    onSuccess: () => {
      void refetchSummary();
      void refetchTransactions();
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Wallet & billing</h1>
        <p className="text-sm text-slate-500">
          Manage subscription windows and message points. Auto-responses pause automatically on expiry.
        </p>
      </div>
      <WalletCard
        summary={summary}
        onTopup={async (payload) => {
          await mutation.mutateAsync(payload);
        }}
        onPurchaseCoins={async (points) => {
          await coinMutation.mutateAsync(points);
        }}
        onGrant={async (payload) => {
          await grantMutation.mutateAsync(payload);
        }}
      />
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Transactions</h2>
        {transactions && transactions.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
              {transactions.map((txn) => (
                <div key={txn.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 capitalize">{txn.txn_type}</span>
                    <span className="text-sm font-semibold text-slate-700">{txn.points} pts</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Balance: {txn.balance_after} pts</p>
                  <p className="text-xs text-slate-500">Reference: {txn.reference ?? "--"}</p>
                  <p className="text-xs text-slate-500">
                    Expires: {txn.expires_at ? new Date(txn.expires_at).toLocaleString() : "--"}
                  </p>
                  <p className="text-xs text-slate-500">When: {new Date(txn.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
              <div className="max-h-72 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Points</th>
                      <th className="px-4 py-2">Balance after</th>
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2">Expires</th>
                      <th className="px-4 py-2">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((txn) => (
                      <tr key={txn.id} className="bg-white">
                        <td className="px-4 py-2 capitalize text-slate-700">{txn.txn_type}</td>
                        <td className="px-4 py-2 text-slate-700">{txn.points}</td>
                        <td className="px-4 py-2 text-slate-700">{txn.balance_after}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{txn.reference ?? "--"}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {txn.expires_at ? new Date(txn.expires_at).toLocaleString() : "--"}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">{new Date(txn.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            No transactions yet
          </div>
        )}
      </div>
    </div>
  );
}
