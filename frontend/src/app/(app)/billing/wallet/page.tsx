"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { WalletCard } from "@/components/wallet-card";
import { apiClient } from "@/lib/api-client";
import type { WalletSummary, WalletTransaction } from "@/types/api";

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
    mutationFn: (payload: { plan_type?: string | null; points?: number | null }) =>
      apiClient.post<WalletSummary>("/wallet/topup", payload),
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
      />
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Transactions</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Points</th>
                <th className="px-4 py-2">Balance after</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions?.map((txn) => (
                <tr key={txn.id} className="bg-white">
                  <td className="px-4 py-2 capitalize text-slate-700">{txn.txn_type}</td>
                  <td className="px-4 py-2 text-slate-700">{txn.points}</td>
                  <td className="px-4 py-2 text-slate-700">{txn.balance_after}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{txn.reference ?? "--"}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(txn.created_at).toLocaleString()}</td>
                </tr>
              )) ?? (
                <tr>
                  <td className="px-4 py-2 text-sm text-slate-500" colSpan={5}>
                    No transactions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
