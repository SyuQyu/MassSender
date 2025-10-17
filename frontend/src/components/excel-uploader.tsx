"use client";

import { useState } from "react";

type ExcelUploaderProps = {
  onFileSelected: (file: File | null) => void;
  accept?: string;
};

export const ExcelUploader = ({ onFileSelected, accept = ".xlsx,.xls,.csv" }: ExcelUploaderProps) => {
  const [fileName, setFileName] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setFileName(file?.name ?? null);
    onFileSelected(file);
  };

  return (
    <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 hover:border-slate-400">
      <span className="font-medium text-slate-700">Drop Excel/CSV here or click to browse</span>
      <span className="text-xs text-slate-400">Headers: name, phone_e164, consent</span>
      <input type="file" className="hidden" accept={accept} onChange={handleChange} />
      {fileName ? <span className="text-xs text-slate-600">Selected: {fileName}</span> : null}
    </label>
  );
};
