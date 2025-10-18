"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { RuleBuilder } from "@/components/rule-builder";
import { apiClient } from "@/lib/api-client";
import type { AutoResponseRule } from "@/types/api";

const fetchRules = async () => {
  const { data } = await apiClient.get<AutoResponseRule[]>("/automation/rules");
  return data;
};

export default function AutomationRulesPage() {
  const { data: rules, refetch } = useQuery({ queryKey: ["automation-rules"], queryFn: fetchRules });

  const createMutation = useMutation({
    mutationFn: (rule: Omit<AutoResponseRule, "id" | "created_at" | "updated_at">) =>
      apiClient.post<AutoResponseRule>("/automation/rules", rule),
    onSuccess: () => void refetch(),
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
      </div>
      <RuleBuilder
        onCreate={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
      />
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
