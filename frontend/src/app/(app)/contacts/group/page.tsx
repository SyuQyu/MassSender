"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { GroupPicker } from "@/components/group-picker";
import { apiClient } from "@/lib/api-client";
import type { ContactList, WhatsAppGroup, WhatsAppMember } from "@/types/api";

const fetchGroups = async () => {
  const { data } = await apiClient.get<WhatsAppGroup[]>("/wa/groups");
  return data;
};

const fetchGroupMembers = async (groupId: string) => {
  const { data } = await apiClient.get<WhatsAppMember[]>(`/wa/groups/${groupId}/members`);
  return data;
};

export default function GroupImportPage() {
  const [result, setResult] = useState<ContactList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<WhatsAppGroup | null>(null);
  const [groupMessage, setGroupMessage] = useState("");
  const [memberMessages, setMemberMessages] = useState<Record<string, string>>({});
  const [sendError, setSendError] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["wa", "groups"],
    queryFn: fetchGroups,
    enabled: false,
  });

  const membersQuery = useQuery({
    queryKey: ["wa", "groups", selectedGroup?.id, "members"],
    queryFn: () => fetchGroupMembers(selectedGroup!.id),
    enabled: Boolean(selectedGroup),
  });

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

  const groupSendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup) throw new Error("No group selected");
      await apiClient.post(`/wa/groups/${selectedGroup.id}/send`, {
        body: groupMessage,
      });
    },
    onSuccess: () => {
      setGroupMessage("");
      setSendError(null);
    },
    onError: () => setSendError("Failed to send message to group"),
  });

  const memberSendMutation = useMutation({
    mutationFn: async ({ phone_e164, body }: { phone_e164: string; body: string }) => {
      if (!selectedGroup) throw new Error("No group selected");
      await apiClient.post(`/wa/groups/${selectedGroup.id}/members/send`, {
        phone_e164,
        body,
      });
    },
    onSuccess: (_, variables) => {
      setMemberMessages((prev) => ({ ...prev, [variables.phone_e164]: "" }));
      setSendError(null);
    },
    onError: () => setSendError("Failed to send message to member"),
  });

  const handleFetchGroups = async () => {
    setGroupError(null);
    try {
      await groupsQuery.refetch();
    } catch {
      setGroupError("Unable to fetch groups. Ensure a device is linked.");
    }
  };

  const handleSelectGroup = (group: WhatsAppGroup) => {
    setSelectedGroup(group);
    setMemberMessages({});
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Import from a WhatsApp group</h1>
        <p className="text-sm text-slate-500">
          Experimental: we will read visible member names and numbers from the linked WhatsApp Web session.
        </p>
      </div>
      <GroupPicker
        value={groupName}
        onChange={setGroupName}
        onSubmit={(group) => mutation.mutate(group)}
        loading={mutation.isPending}
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {result ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Imported list: {result.name}</p>
          <p>{result.total_contacts} members captured.</p>
          <p className="text-xs text-slate-500">Numbers hidden? We fall back to chat context messaging only.</p>
        </div>
      ) : null}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Available groups</h2>
            <p className="text-sm text-slate-500">Fetch the list of groups detected by the active WhatsApp connection.</p>
          </div>
          <button
            onClick={handleFetchGroups}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-70"
            disabled={groupsQuery.isFetching}
          >
            {groupsQuery.isFetching ? "Loading…" : "Fetch groups"}
          </button>
        </div>
        {groupError ? <p className="text-sm text-rose-600">{groupError}</p> : null}
        <div className="space-y-2">
          {groupsQuery.data?.length ? (
            groupsQuery.data.map((group) => (
              <div
                key={group.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
              >
                <div>
                  <p className="font-semibold text-slate-900">{group.name || group.id}</p>
                  <p className="text-xs text-slate-500">ID: {group.id}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{group.participant_count} participants</span>
                  <button
                    onClick={() => setGroupName(group.name || group.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  >
                    Use name
                  </button>
                  <button
                    onClick={() => handleSelectGroup(group)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  >
                    View members
                  </button>
                </div>
              </div>
            ))
          ) : groupsQuery.isFetched ? (
            <p className="text-sm text-slate-500">No groups detected for the current connection.</p>
          ) : (
            <p className="text-sm text-slate-500">Groups have not been fetched yet.</p>
          )}
        </div>
      </section>
      {selectedGroup ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedGroup.name || selectedGroup.id} · Members
              </h2>
              <p className="text-sm text-slate-500">
                Send a quick broadcast to the group or target an individual member.
              </p>
            </div>
            <button
              onClick={() => membersQuery.refetch()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-70"
              disabled={membersQuery.isFetching}
            >
              {membersQuery.isFetching ? "Refreshing…" : "Refresh members"}
            </button>
          </div>
          {sendError ? <p className="text-sm text-rose-600">{sendError}</p> : null}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Send message to group</h3>
            <textarea
              value={groupMessage}
              onChange={(event) => setGroupMessage(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              placeholder="Hello everyone…"
            />
            <button
              onClick={() => groupSendMutation.mutate()}
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={groupSendMutation.isLoading || !groupMessage.trim()}
            >
              {groupSendMutation.isLoading ? "Sending…" : "Send to group"}
            </button>
          </div>
          <div className="space-y-2">
            {membersQuery.data?.length ? (
              membersQuery.data.map((member) => (
                <div
                  key={member.phone_e164}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{member.name || member.phone_e164}</p>
                      <p className="text-xs text-slate-500">{member.phone_e164}</p>
                    </div>
                  </div>
                  <textarea
                    value={memberMessages[member.phone_e164] ?? ""}
                    onChange={(event) =>
                      setMemberMessages((prev) => ({ ...prev, [member.phone_e164]: event.target.value }))
                    }
                    rows={2}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                    placeholder={`Message ${member.name || member.phone_e164}`}
                  />
                  <button
                    onClick={() =>
                      memberSendMutation.mutate({
                        phone_e164: member.phone_e164,
                        body: memberMessages[member.phone_e164] ?? "",
                      })
                    }
                    className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    disabled={
                      memberSendMutation.isLoading ||
                      !(memberMessages[member.phone_e164] ?? "").trim()
                    }
                  >
                    {memberSendMutation.isLoading ? "Sending…" : "Send to member"}
                  </button>
                </div>
              ))
            ) : membersQuery.isFetching ? (
              <p className="text-sm text-slate-500">Loading members…</p>
            ) : (
              <p className="text-sm text-slate-500">No members found.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
