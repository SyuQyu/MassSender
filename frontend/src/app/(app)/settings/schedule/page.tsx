"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { ScheduleEditor } from "@/components/schedule-editor";
import { apiClient } from "@/lib/api-client";
import type { ActiveSchedule } from "@/types/api";

const fetchSchedule = async () => {
  const { data } = await apiClient.get<ActiveSchedule | null>("/automation/schedule");
  return data;
};

export default function SchedulePage() {
  const { data: schedule, refetch } = useQuery({ queryKey: ["schedule"], queryFn: fetchSchedule });

  const mutation = useMutation({
    mutationFn: (payload: Omit<ActiveSchedule, "id" | "created_at" | "updated_at">) =>
      apiClient.put<ActiveSchedule>("/automation/schedule", payload),
    onSuccess: () => void refetch(),
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Active hours</h1>
        <p className="text-sm text-slate-500">
          Define when MassSender is allowed to auto-respond. Outside these windows, inbound messages will be muted.
        </p>
      </div>
      <ScheduleEditor
        schedule={schedule ?? null}
        onSave={async (payload) => {
          await mutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
