"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { TemplateEditor } from "@/components/template-editor";
import { AiAssistant } from "@/components/ai-assistant";
import { apiClient } from "@/lib/api-client";
import type { AiSubscriptionStatus, Campaign, ContactList, Session } from "@/types/api";

const fetchLists = async () => {
  const { data } = await apiClient.get<ContactList[]>("/contacts/lists");
  return data;
};

const fetchSessions = async () => {
  const { data } = await apiClient.get<Session[]>("/wa/sessions");
  return data;
};

const fetchAiStatus = async () => {
  const { data } = await apiClient.get<AiSubscriptionStatus>("/ai/status");
  return data;
};

export default function NewCampaignPage() {
  const router = useRouter();
  const { data: lists } = useQuery({ queryKey: ["contact-lists"], queryFn: fetchLists });
  const { data: sessions } = useQuery({ queryKey: ["wa", "sessions"], queryFn: fetchSessions });
  const { data: aiStatus } = useQuery({ queryKey: ["ai", "status"], queryFn: fetchAiStatus });
  const [listId, setListId] = useState<string>("");
  const [name, setName] = useState("Reminder blast");
  const [body, setBody] = useState("Hello {{name}}, just a friendly reminder about our session tomorrow.");
  const [mediaUrl, setMediaUrl] = useState("");
  const [throttleMin, setThrottleMin] = useState(2);
  const [throttleMax, setThrottleMax] = useState(5);
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      setSessionId(sessions[0].id);
    }
  }, [sessions, sessionId]);

  const selectedSession = useMemo(
    () => sessions?.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const variables = Array.from(body.matchAll(/{{(.*?)}}/g)).map((match) => match[1]);
      const { data } = await apiClient.post<Campaign>("/campaigns", {
        list_id: listId,
        name,
        template_body: body,
        template_variables: variables,
        media_url: mediaUrl || null,
        throttle_min_seconds: throttleMin,
        throttle_max_seconds: throttleMax,
        session_id: sessionId || null,
      });
      return data;
    },
    onSuccess: (campaign) => {
      router.push(`/campaigns/${campaign.id}`);
    },
  });

  const buildAiPrompt = useCallback(() => {
    const lines = [
      "Compose a WhatsApp campaign message in Indonesian.",
      `Campaign name: ${name}.`,
      listId ? `List selected: ${listId}.` : "No list selected yet.",
      mediaUrl ? "A media link will be attached." : "No media attachment.",
      `Current draft: ${body || "(empty)"}`,
      "Message should stay concise, friendly, and personalised using {{name}} placeholder when appropriate.",
    ];
    return lines.join("\n");
  }, [name, listId, mediaUrl, body]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Create campaign</h1>
        <p className="text-sm text-slate-500">Choose a contact list, craft your template, and set media/throttle preferences.</p>
        {aiStatus ? (
          <p className="text-xs text-slate-500">
            AI assistant: {aiStatus.active ? "Active" : aiStatus.trial_available ? "Trial available (starts on first use)" : "Inactive"}
            {aiStatus.expires_at ? ` · expires ${new Date(aiStatus.expires_at).toLocaleString()}` : ""}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Campaign name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Contact list
          <select
            value={listId}
            onChange={(event) => setListId(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          >
            <option value="">Select a list</option>
            {lists?.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} ({list.total_contacts} contacts)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          WhatsApp connection
          <select
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          >
            <option value="">Select a connection</option>
            {sessions?.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label} · {session.status}
              </option>
            ))}
          </select>
          {selectedSession && selectedSession.status !== "linked" ? (
            <span className="text-xs font-normal text-amber-600">
              This session is {selectedSession.status}. Scan the QR code before launching a campaign.
            </span>
          ) : null}
          {!sessions?.length ? (
            <span className="text-xs font-normal text-rose-600">No sessions available. Add a connection before creating a campaign.</span>
          ) : null}
        </label>
        <TemplateEditor
          body={body}
          onChange={setBody}
          variables={Array.from(new Set(Array.from(body.matchAll(/{{(.*?)}}/g)).map((match) => match[1])))}
        />
        <AiAssistant
          topic="campaign_message"
          buildPrompt={buildAiPrompt}
          onApply={setBody}
          context={{ campaign_name: name, has_media: Boolean(mediaUrl) }}
          buttonLabel="Ask AI for template"
          disabled={!(aiStatus?.active || aiStatus?.trial_available)}
          disabledMessage={
            aiStatus?.active
              ? undefined
              : aiStatus?.trial_available
                ? "Trial available: using AI will activate a 1-day trial."
                : "AI assistant inactive. Contact support to enable this feature."
          }
        />
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Optional media URL
          <input
            value={mediaUrl}
            onChange={(event) => setMediaUrl(event.target.value)}
            placeholder="Paste upload URL or use /media/upload"
            className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Min delay (seconds)
            <input
              type="number"
              min={1}
              value={throttleMin}
              onChange={(event) => setThrottleMin(Number(event.target.value))}
              className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Max delay (seconds)
            <input
              type="number"
              min={throttleMin}
              value={throttleMax}
              onChange={(event) => setThrottleMax(Number(event.target.value))}
              className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={!listId || !sessionId || mutation.isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {mutation.isPending ? "Creating..." : "Create campaign"}
        </button>
      </div>
    </div>
  );
}
