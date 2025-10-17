"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { GroupPicker } from "@/components/group-picker";
import { apiClient } from "@/lib/api-client";
import type { ContactList } from "@/types/api";

export default function GroupImportPage() {
  const [result, setResult] = useState<ContactList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (groupName: string) => {
      const { data } = await apiClient.post<ContactList>("/contacts/group", { group_name: groupName });
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: () => setError("Failed to import group members"),
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Import from a WhatsApp group</h1>
        <p className="text-sm text-slate-500">
          Experimental: we will read visible member names and numbers from the linked WhatsApp Web session.
        </p>
      </div>
      <GroupPicker onSubmit={(group) => mutation.mutate(group)} loading={mutation.isPending} />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {result ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Imported list: {result.name}</p>
          <p>{result.total_contacts} members captured.</p>
          <p className="text-xs text-slate-500">Numbers hidden? We fall back to chat context messaging only.</p>
        </div>
      ) : null}
    </div>
  );
}
