"use client";

import { useState } from "react";

import type { ActiveSchedule, TimeWindow } from "@/types/api";

type ScheduleEditorProps = {
  schedule: ActiveSchedule | null;
  onSave: (payload: Omit<ActiveSchedule, "id" | "created_at" | "updated_at">) => Promise<void>;
};

const defaultWindows: TimeWindow[] = [
  { day_of_week: 0, start_time: "08:00", end_time: "20:00" },
  { day_of_week: 1, start_time: "08:00", end_time: "20:00" },
  { day_of_week: 2, start_time: "08:00", end_time: "20:00" },
  { day_of_week: 3, start_time: "08:00", end_time: "20:00" },
  { day_of_week: 4, start_time: "08:00", end_time: "20:00" },
];

export const ScheduleEditor = ({ schedule, onSave }: ScheduleEditorProps) => {
  const [name, setName] = useState(schedule?.name ?? "Default schedule");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "Asia/Jakarta");
  const [isActive, setIsActive] = useState(schedule?.is_active ?? true);
  const [windows, setWindows] = useState<TimeWindow[]>(schedule?.windows ?? defaultWindows);

  const updateWindow = (index: number, patch: Partial<TimeWindow>) => {
    setWindows((prev) => prev.map((window, idx) => (idx === index ? { ...window, ...patch } : window)));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSave({ name, timezone, windows, is_active: isActive } as ActiveSchedule);
      }}
    >
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Schedule name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
        />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Timezone (IANA)
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active
        </label>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">Active windows</p>
        <div className="space-y-2">
          {windows.map((window, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Day (0-6)
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={window.day_of_week}
                  onChange={(event) => updateWindow(index, { day_of_week: Number(event.target.value) })}
                  className="rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Start
                <input
                  type="time"
                  value={window.start_time}
                  onChange={(event) => updateWindow(index, { start_time: event.target.value })}
                  className="rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                End
                <input
                  type="time"
                  value={window.end_time}
                  onChange={(event) => updateWindow(index, { end_time: event.target.value })}
                  className="rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none"
                />
              </label>
              <button
                type="button"
                className="self-end rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600"
                onClick={() => setWindows((prev) => prev.filter((_, idx) => idx !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setWindows((prev) => [...prev, { day_of_week: 5, start_time: "09:00", end_time: "17:00" }])}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Add window
        </button>
      </div>
      <button
        type="submit"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Save schedule
      </button>
    </form>
  );
};
