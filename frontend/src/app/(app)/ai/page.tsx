"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { UserSearchSelect } from "@/components/user-search-select";
import type { AiSubscriptionStatus, UserSearchResult, WalletSummary } from "@/types/api";

const fetchAiStatus = async () => {
  const { data } = await apiClient.get<AiSubscriptionStatus>("/ai/status");
  return data;
};

const fetchWalletSummary = async () => {
  const { data } = await apiClient.get<WalletSummary>("/wallet");
  return data;
};

export default function AiAssistantPage() {
  const { data: status, refetch: refetchStatus } = useQuery({ queryKey: ["ai", "status"], queryFn: fetchAiStatus });
  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: fetchWalletSummary });
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [plan, setPlan] = useState<"5d" | "15d" | "30d">("5d");
  const [formError, setFormError] = useState<string | null>(null);

  const grantMutation = useMutation({
    mutationFn: async ({ email, plan: selectedPlan }: { email: string; plan: "5d" | "15d" | "30d" }) => {
      await apiClient.post("/ai/subscription/grant", { user_email: email, plan: selectedPlan });
    },
    onSuccess: () => {
      void refetchStatus();
      setSelectedUser(null);
      setFormError(null);
    },
    onError: () => {
      setFormError("Unable to grant access. Check the user and try again.");
    },
  });

  const activeLabel = status?.active
    ? status.expires_at
      ? `Active until ${new Date(status.expires_at).toLocaleString()}`
      : "Active"
    : status?.trial_available
      ? "Trial available (starts on first AI usage)"
      : "Inactive";

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">AI Assistant</h1>
        <p className="text-sm text-slate-500">
          Ask AI helps craft campaign messages and automation replies. Access is managed per user. Each account receives a complimentary 1-day
          trial on first use, and admins can allocate 5, 15, or 30-day passes.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          <p className="font-medium text-slate-900">Your status</p>
          <p>{activeLabel}</p>
          {status?.plan_name ? <p>Plan: {status.plan_name}</p> : null}
        </div>
      </section>

      {wallet?.can_allocate_points ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Admin controls</h2>
          <p className="text-sm text-slate-500">Grant AI passes to users. Existing plans extend from their current expiry date.</p>
          <form
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedUser) {
                setFormError("Select a user to grant access.");
                return;
              }
              setFormError(null);
              void grantMutation.mutateAsync({ email: selectedUser.email, plan });
            }}
          >
            <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              User
              <UserSearchSelect
                value={selectedUser}
                onChange={(user) => {
                  setSelectedUser(user);
                  if (user) {
                    setFormError(null);
                  }
                }}
                helperText="Type at least two characters to search by name or email."
              />
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Plan duration
              <select
                value={plan}
                onChange={(event) => setPlan(event.target.value as typeof plan)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              >
                <option value="5d">5 days</option>
                <option value="15d">15 days</option>
                <option value="30d">30 days</option>
              </select>
            </label>
            <button
              type="submit"
              className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={grantMutation.isPending}
            >
              {grantMutation.isPending ? "Granting..." : "Grant access"}
            </button>
            {formError ? <p className="text-xs text-rose-600">{formError}</p> : null}
          </form>
        </section>
      ) : null}
    </div>
  );
}
