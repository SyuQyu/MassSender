"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { TemplateEditor } from "@/components/template-editor";
import { apiClient } from "@/lib/api-client";
import type { Campaign, ContactList } from "@/types/api";

const fetchLists = async () => {
  const { data } = await apiClient.get<ContactList[]>("/contacts/lists");
  return data;
};

export default function NewCampaignPage() {
  const router = useRouter();
  const { data: lists } = useQuery({ queryKey: ["contact-lists"], queryFn: fetchLists });
  const [listId, setListId] = useState<string>("");
  const [name, setName] = useState("Reminder blast");
  const [body, setBody] = useState("Hello {{name}}, just a friendly reminder about our session tomorrow.");
  const [mediaUrl, setMediaUrl] = useState("");
  const [throttleMin, setThrottleMin] = useState(2);
  const [throttleMax, setThrottleMax] = useState(5);

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
      });
      return data;
    },
    onSuccess: (campaign) => {
      router.push(`/campaigns/${campaign.id}`);
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Create campaign</h1>
        <p className="text-sm text-slate-500">Choose a contact list, craft your template, and set media/throttle preferences.</p>
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
        <TemplateEditor
          body={body}
          onChange={setBody}
          variables={Array.from(new Set(Array.from(body.matchAll(/{{(.*?)}}/g)).map((match) => match[1])))}
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
          disabled={!listId || mutation.isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {mutation.isPending ? "Creating..." : "Create campaign"}
        </button>
      </div>
    </div>
  );
}
