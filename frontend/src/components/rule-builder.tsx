"use client";

import { useEffect, useState } from "react";

import type { AutoResponseRule, TimeWindow } from "@/types/api";

type RuleBuilderProps = {
  onSubmit: (rule: Omit<AutoResponseRule, "id" | "created_at" | "updated_at">) => Promise<void>;
  submitLabel?: string;
  initialRule?: AutoResponseRule | null;
  onCancel?: () => void;
};

const defaultWindow: TimeWindow = {
  day_of_week: 0,
  start_time: "08:00",
  end_time: "18:00",
};

const fallbackRule: Omit<AutoResponseRule, "id" | "created_at" | "updated_at"> = {
  name: "Auto-reply",
  trigger_type: "keyword",
  trigger_value: "hi",
  response_text: "Hello! Here's our schedule...",
  response_media_url: null,
  cooldown_seconds: 0,
  active: true,
  active_windows: [],
};

export const RuleBuilder = ({ onSubmit, submitLabel = "Save rule", initialRule, onCancel }: RuleBuilderProps) => {
  const rule = initialRule ? { ...fallbackRule, ...initialRule } : fallbackRule;

  const [name, setName] = useState(rule.name);
  const [triggerType, setTriggerType] = useState<"keyword" | "contains" | "regex">(rule.trigger_type);
  const [triggerValue, setTriggerValue] = useState(rule.trigger_value);
  const [responseText, setResponseText] = useState(rule.response_text ?? "");
  const [cooldown, setCooldown] = useState(rule.cooldown_seconds ?? 0);
  const [active, setActive] = useState(rule.active);
  const [useWindow, setUseWindow] = useState(rule.active_windows.length > 0);
  const [windowConfig, setWindowConfig] = useState<TimeWindow>(
    rule.active_windows[0] ?? defaultWindow,
  );

  useEffect(() => {
    if (!initialRule) {
      setName(fallbackRule.name);
      setTriggerType(fallbackRule.trigger_type);
      setTriggerValue(fallbackRule.trigger_value);
      setResponseText(fallbackRule.response_text ?? "");
      setCooldown(fallbackRule.cooldown_seconds);
      setActive(fallbackRule.active);
      setUseWindow(false);
      setWindowConfig(defaultWindow);
      return;
    }
    setName(initialRule.name);
    setTriggerType(initialRule.trigger_type);
    setTriggerValue(initialRule.trigger_value);
    setResponseText(initialRule.response_text ?? "");
    setCooldown(initialRule.cooldown_seconds ?? 0);
    setActive(initialRule.active);
    setUseWindow((initialRule.active_windows ?? []).length > 0);
    setWindowConfig(initialRule.active_windows[0] ?? defaultWindow);
  }, [initialRule?.id]);

  const resetForm = () => {
    setName(fallbackRule.name);
    setTriggerType(fallbackRule.trigger_type);
    setTriggerValue(fallbackRule.trigger_value);
    setResponseText(fallbackRule.response_text ?? "");
    setCooldown(fallbackRule.cooldown_seconds);
    setActive(fallbackRule.active);
    setUseWindow(false);
    setWindowConfig(defaultWindow);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({
      name,
      trigger_type: triggerType,
      trigger_value: triggerValue,
      response_text: responseText,
      response_media_url: null,
      cooldown_seconds: cooldown,
      active,
      active_windows: useWindow ? [windowConfig] : [],
    });
    if (!initialRule) {
      resetForm();
    }
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
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
};
