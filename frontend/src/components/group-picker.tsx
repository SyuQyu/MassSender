"use client";

import { useEffect, useState } from "react";

type GroupPickerProps = {
  onSubmit: (groupName: string) => void;
  loading?: boolean;
  value?: string;
  onChange?: (name: string) => void;
};

export const GroupPicker = ({ onSubmit, loading, value, onChange }: GroupPickerProps) => {
  const [internalValue, setInternalValue] = useState(value ?? "");

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const groupName = value ?? internalValue;

  const handleChange = (next: string) => {
    if (onChange) {
      onChange(next);
    } else {
      setInternalValue(next);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(groupName);
      }}
    >
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        WhatsApp group name or invite link
        <input
          value={groupName}
          onChange={(event) => handleChange(event.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-slate-400 focus:outline-none"
          placeholder="e.g. Class of 2026"
          required
        />
      </label>
      <button
        type="submit"
        disabled={!groupName || loading}
        className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Fetching..." : "Import group"}
      </button>
    </form>
  );
};
