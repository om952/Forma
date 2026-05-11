"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "../../lib/api";
import { setAuthToken } from "../../lib/auth";

type AuthMode = "signup" | "login";

type AuthPayload = {
  email: string;
  password: string;
  organizationName?: string;
};

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      const payload: AuthPayload = {
        email,
        password,
      };

      if (organizationName.trim()) {
        payload.organizationName = organizationName.trim();
      }

      const response = await apiFetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Authentication failed");
      }

      const data = (await response.json()) as { token?: string };

      if (!data.token) {
        throw new Error("Token not returned by server");
      }

      setAuthToken(data.token);
      setStatus("Authenticated. Redirecting to builder...");
      router.push("/builder");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#e9f7ff_0%,#f8f1ff_45%,#fff7ed_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <header className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Forma Access
          </p>
          <h1 className="text-3xl font-semibold">{mode === "signup" ? "Create your workspace" : "Sign in"}</h1>
          <p className="text-sm text-slate-600">
            Use your org name for signup and optional org name for login if you manage multiple orgs.
          </p>
        </header>

        <form
          className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/5 p-2">
              <button
                type="button"
                className={`flex-1 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  mode === "signup"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>
              <button
                type="button"
                className={`flex-1 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  mode === "login"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setMode("login")}
              >
                Log in
              </button>
            </div>

            <label className="text-sm font-medium text-slate-700">
              Email
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Password
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Organization name
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                type="text"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder={mode === "signup" ? "Acme Inc" : "Optional"}
                required={mode === "signup"}
              />
            </label>
          </div>

          <button
            className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Submitting..."
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>

          {status ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {status}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
