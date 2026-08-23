"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "../../lib/api";
import { setAuthToken, setAuthUser } from "../../lib/auth";

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

      const data = (await response.json()) as {
        token?: string;
        user?: { id: string; email: string; role: string; orgId: string };
      };

      if (!data.token) {
        throw new Error("Token not returned by server");
      }

      setAuthToken(data.token);
      if (data.user) {
        setAuthUser(data.user as any);
      }
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
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 to-indigo-900 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10 blur-3xl"
        />

        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
            F
          </span>
          <span className="text-lg font-semibold">Forma</span>
        </Link>

        <div className="relative">
          <h2 className="text-3xl font-semibold leading-snug tracking-tight">
            Build forms your whole team can rely on.
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-indigo-100">
            <li className="flex items-start gap-3">
              <span className="mt-0.5">⚡</span>
              Conditional logic and 8 field types, no code required.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5">🔌</span>
              Route submissions to Slack, Zapier, or any webhook — with automatic
              retries.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5">📊</span>
              Drop-off rates and heatmaps on every field.
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-indigo-200">
          Org-scoped data isolation, built in from day one.
        </p>
      </div>

      <div className="flex w-full flex-col justify-center bg-slate-50 px-6 py-12 lg:w-1/2">
        <div className="mx-auto flex w-full max-w-md flex-col gap-5">
          <Link href="/" className="mb-2 flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              F
            </span>
            <span className="text-lg font-semibold text-slate-900">Forma</span>
          </Link>

          <header>
            <p className="eyebrow">Welcome</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {mode === "signup" ? "Create your workspace" : "Sign in"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {mode === "signup"
                ? "Set an organization name — that's your team's workspace."
                : "Add your organization name if you belong to more than one."}
            </p>
          </header>

          <form
            className="card-elevated space-y-5"
            onSubmit={handleSubmit}
          >
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1.5">
            <button
              type="button"
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
          </div>

          <label className="label block">
            Email
            <input
              className="input mt-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="label block">
            Password
            <input
              className="input mt-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <label className="label block">
            Organization name
            <input
              className="input mt-2"
              type="text"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder={mode === "signup" ? "Acme Inc" : "Optional"}
              required={mode === "signup"}
            />
          </label>

          <button
            className="btn-primary w-full"
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
            <div className="status-info">{status}</div>
          ) : null}
        </form>
        </div>
      </div>
    </div>
  );
}
