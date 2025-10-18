"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { RuleBuilder } from "@/components/rule-builder";
import { apiClient } from "@/lib/api-client";
import type { AiSubscriptionStatus, AutoResponseRule } from "@/types/api";

const fetchRules = async () => {
  const { data } = await apiClient.get<AutoResponseRule[]>("/automation/rules");
  return data;
};

const fetchAiStatus = async () => {
  const { data } = await apiClient.get<AiSubscriptionStatus>("/ai/status");
  return data;
};

export default function AutomationRulesPage() {
  const { data: rules, refetch } = useQuery({ queryKey: ["automation-rules"], queryFn: fetchRules });
  const { data: aiStatus } = useQuery({ queryKey: ["ai", "status"], queryFn: fetchAiStatus });
  const [editingRule, setEditingRule] = useState<AutoResponseRule | null>(null);

  const createMutation = useMutation({
    mutationFn: (rule: Omit<AutoResponseRule, "id" | "created_at" | "updated_at">) =>
      apiClient.post<AutoResponseRule>("/automation/rules", rule),
    onSuccess: () => void refetch(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Omit<AutoResponseRule, "id" | "created_at" | "updated_at"> }) =>
      apiClient.put<AutoResponseRule>(`/automation/rules/${id}`, payload),
    onSuccess: () => {
      setEditingRule(null);
      void refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/automation/rules/${id}`),
    onSuccess: () => void refetch(),
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: AutoResponseRule) =>
      apiClient.put<AutoResponseRule>(`/automation/rules/${rule.id}`, {
        ...rule,
        active: !rule.active,
      }),
    onSuccess: () => void refetch(),
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Automation rules</h1>
        <p className="text-sm text-slate-500">
          Respond to inbound WhatsApp messages based on keywords, contains, or regex triggers. Respect cooldowns to avoid spam.
        </p>
        {aiStatus ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
            <p>
              AI assistant status:
              {" "}
              {aiStatus.active
                ? "Active"
                : aiStatus.trial_available
                  ? "Trial available (activates for 1 day on first use)"
                  : "Inactive"}
            </p>
            {aiStatus.expires_at ? (
              <p>Expires {new Date(aiStatus.expires_at).toLocaleString()}</p>
            ) : null}
            {aiStatus.plan_name ? <p>Plan: {aiStatus.plan_name}</p> : null}
          </div>
        ) : null}
      </div>
      <RuleBuilder
        onSubmit={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
        aiEnabled={Boolean(aiStatus?.active || aiStatus?.trial_available)}
        aiStatusMessage={
          aiStatus?.active
            ? aiStatus.expires_at
              ? `AI assistant active · expires ${new Date(aiStatus.expires_at).toLocaleString()}`
              : "AI assistant active"
            : aiStatus?.trial_available
              ? "Trial available: using AI will activate a 1-day trial."
              : "AI assistant inactive. Contact support to enable this feature."
        }
      />
      {editingRule ? (
        <RuleBuilder
          initialRule={editingRule}
          submitLabel="Update rule"
          onSubmit={async (payload) => {
            await updateMutation.mutateAsync({ id: editingRule.id, payload });
          }}
          onCancel={() => setEditingRule(null)}
          aiEnabled={Boolean(aiStatus?.active || aiStatus?.trial_available)}
          aiStatusMessage={
            aiStatus?.active
              ? aiStatus.expires_at
                ? `AI assistant active · expires ${new Date(aiStatus.expires_at).toLocaleString()}`
                : "AI assistant active"
              : aiStatus?.trial_available
                ? "Trial available: using AI will activate a 1-day trial."
                : "AI assistant inactive. Contact support to enable this feature."
          }
        />
      ) : null}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Existing rules</h2>
        <div className="space-y-2">
          {rules?.map((rule) => (
            <div key={rule.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-slate-900">{rule.name}</p>
                <p className="text-xs text-slate-500">
                  Trigger: {rule.trigger_type} → {rule.trigger_value} •
                  {" "}
                  {rule.cooldown_seconds ? `${rule.cooldown_seconds}s cooldown` : "No cooldown"}
                </p>
                <p className="text-sm text-slate-600">{rule.response_text}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleMutation.mutate(rule)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  {rule.active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => setEditingRule(rule)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600"
                >
                  Delete
                </button>
              </div>
            </div>
          )) ?? <p className="text-sm text-slate-500">No rules yet.</p>}
        </div>
      </div>
    </div>
  );
}
