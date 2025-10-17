"use client";

import { useMemo } from "react";

type TemplateEditorProps = {
  body: string;
  onChange: (value: string) => void;
  variables: string[];
};

const sampleData: Record<string, string> = {
  name: "Ayu",
};

export const TemplateEditor = ({ body, onChange, variables }: TemplateEditorProps) => {
  const preview = useMemo(() => {
    return variables.reduce((acc, variable) => acc.replaceAll(`{{${variable}}}`, sampleData[variable] ?? "<value>"), body);
  }, [body, variables]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700">Message template</label>
        <textarea
          value={body}
          onChange={(event) => onChange(event.target.value)}
          rows={8}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
          placeholder="Hello {{name}}, we wanted to remind you about..."
        />
        <p className="text-xs text-slate-400">Available variables: {variables.length ? variables.join(", ") : "Add them via {{name}} syntax"}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Preview</span>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-inner">
          {preview || "Template preview will appear here"}
        </div>
      </div>
    </div>
  );
};
