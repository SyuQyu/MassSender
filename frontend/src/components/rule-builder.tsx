"use client";

import { useState } from "react";

import type { AutoResponseRule, TimeWindow } from "@/types/api";

type RuleBuilderProps = {
  onCreate: (rule: Omit<AutoResponseRule, "id" | "created_at" | "updated_at">) => Promise<void>;
};

const defaultWindow: TimeWindow = {
  day_of_week: 0,
  start_time: "08:00",
  end_time: "18:00",
};

export const RuleBuilder = ({ onCreate }: RuleBuilderProps) => {
  const [name, setName] = useState("Auto-reply");
  const [triggerType, setTriggerType] = useState<"keyword" | "contains" | "regex">("keyword");
  const [triggerValue, setTriggerValue] = useState("hi");
  const [responseText, setResponseText] = useState("Hello! Here's our schedule...");
  const [cooldown, setCooldown] = useState(0);
  const [active, setActive] = useState(true);
  const [useWindow, setUseWindow] = useState(false);
  const [windowConfig, setWindowConfig] = useState<TimeWindow>(defaultWindow);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onCreate({
      name,
      trigger_type: triggerType,
      trigger_value: triggerValue,
      response_text: responseText,
      response_media_url: null,
      cooldown_seconds: cooldown,
      active,
      active_windows: useWindow ? [windowConfig] : [],
    });
  };

  return (
    <form className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Rule name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Trigger
          <div className="flex gap-2">
            <select
              value={triggerType}
              onChange={(event) => setTriggerType(event.target.value as typeof triggerType)}
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="keyword">Keyword</option>
              <option value="contains">Contains</option>
              <option value="regex">Regex</option>
            </select>
            <input
              value={triggerValue}
              onChange={(event) => setTriggerValue(event.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Response text
        <textarea
          value={responseText}
          onChange={(event) => setResponseText(event.target.value)}
          rows={3}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
        />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Cooldown (seconds)
          <input
            type="number"
            min={0}
            value={cooldown}
            onChange={(event) => setCooldown(Math.max(0, Number(event.target.value) || 0))}
            className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          />
          <span className="text-xs font-normal text-slate-500">Set 0 to respond without a delay.</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={useWindow} onChange={(event) => setUseWindow(event.target.checked)} /> Restrict to window
        </label>
      </div>
      {useWindow ? (
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Day of week (0=Mon)
            <input
              type="number"
              min={0}
              max={6}
              value={windowConfig.day_of_week}
              onChange={(event) =>
                setWindowConfig((prev) => ({ ...prev, day_of_week: Number(event.target.value) }))
              }
              className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Start
            <input
              type="time"
              value={windowConfig.start_time}
              onChange={(event) => setWindowConfig((prev) => ({ ...prev, start_time: event.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            End
            <input
              type="time"
              value={windowConfig.end_time}
              onChange={(event) => setWindowConfig((prev) => ({ ...prev, end_time: event.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>
      ) : null}
      <button
        type="submit"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Save rule
      </button>
    </form>
  );
};
