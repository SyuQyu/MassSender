"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { AiSuggestionRequest, AiSuggestionResponse } from "@/types/api";

type AiAssistantProps = {
  topic: AiSuggestionRequest["topic"];
  buildPrompt: () => string;
  onApply: (text: string) => void;
  context?: Record<string, unknown> | null;
  buttonLabel?: string;
  disabled?: boolean;
  disabledMessage?: string;
};

export const AiAssistant = ({
  topic,
  buildPrompt,
  onApply,
  context = null,
  buttonLabel = "Ask AI",
  disabled = false,
  disabledMessage,
}: AiAssistantProps) => {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: AiSuggestionRequest) => {
      const { data } = await apiClient.post<AiSuggestionResponse>("/ai/suggest", payload);
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      onApply(data.text.trim());
    },
    onError: (err: unknown) => {
      console.error("AI suggestion failed", err);
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Unable to fetch suggestion. Try again later.");
    },
  });

  useEffect(() => {
    if (open) {
      setPrompt(buildPrompt());
      setError(null);
    }
  }, [open, buildPrompt]);

  const handleGenerate = () => {
    if (disabled) {
      return;
    }
    if (!prompt.trim()) {
      setError("Describe what you need before generating.");
      return;
    }
    mutation.mutate({ topic, prompt: prompt.trim(), context, temperature: 0.7 });
  };

  const toggleAssistant = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggleAssistant}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
        disabled={disabled}
      >
        {open ? "Hide AI assistant" : buttonLabel}
      </button>
      {disabled && disabledMessage ? (
        <p className="text-xs text-amber-600">{disabledMessage}</p>
      ) : null}
      {open ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            placeholder="Describe the tone, goal, and key details for the AI to include."
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={mutation.isPending || disabled}
            >
              {mutation.isPending ? "Generating..." : "Generate suggestion"}
            </button>
            <button
              type="button"
              onClick={() => setPrompt(buildPrompt())}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
            >
              Reset prompt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
