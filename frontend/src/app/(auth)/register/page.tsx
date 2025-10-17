"use client";

import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/contexts/auth-context";

export default function RegisterPage() {
  const { register, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await register({ email, password, full_name: fullName, timezone });
    } catch (err) {
      console.error(err);
      setError("Unable to register, please try again");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Create an account</h1>
        <p className="mt-2 text-sm text-slate-500">
          Link your WhatsApp session and start building safe, opt-in outreach.
        </p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Full Name
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="e.g. Mia Santoso"
              className="rounded-lg border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Timezone
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" defaultChecked required /> I confirm contacts have opted in and I will respect WhatsApp
            rate limits.
          </label>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            Register
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          Already using MassSender?{" "}
          <Link href="/login" className="font-semibold text-slate-900 hover:underline">
            Log in
          </Link>
        </p>
      </div>
      <p className="text-center text-xs text-slate-400">
        WhatsApp ToS forbids spam. Keep cohorts small and respectful.
      </p>
    </div>
  );
}
