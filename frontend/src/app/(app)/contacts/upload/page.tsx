"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ExcelUploader } from "@/components/excel-uploader";
import { apiClient } from "@/lib/api-client";
import type { ContactList } from "@/types/api";

const fetchLists = async () => {
  const { data } = await apiClient.get<ContactList[]>("/contacts/lists");
  return data;
};

export default function UploadContactsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState("Classmates");
  const [message, setMessage] = useState<string | null>(null);

  const { data: lists, refetch } = useQuery({ queryKey: ["contact-lists"], queryFn: fetchLists });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", name);
      const { data } = await apiClient.post<ContactList>("/contacts/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: (data) => {
      setMessage(`Uploaded ${data.total_contacts} contacts to ${data.name}`);
      void refetch();
    },
    onError: (error) => {
      console.error(error);
      setMessage("Failed to upload contacts");
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Upload an opt-in contact list</h1>
        <p className="text-sm text-slate-500">
          Validate E.164 numbers and consent flags directly from your spreadsheet.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            List name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <ExcelUploader onFileSelected={setSelectedFile} />
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!selectedFile || uploadMutation.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload contacts"}
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
        <aside className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <h2 className="text-base font-semibold text-slate-900">Recent lists</h2>
          <ul className="space-y-2">
            {lists?.map((list) => (
              <li key={list.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="font-medium text-slate-900">{list.name}</p>
                <p className="text-xs text-slate-500">{list.total_contacts} contacts • {list.source}</p>
              </li>
            )) ?? <li className="text-xs text-slate-500">No lists yet</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
