"use client";

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
    <div className="page-bg px-6 py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <header className="card-elevated text-center">
          <p className="eyebrow">Forma Access</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            {mode === "signup" ? "Create your workspace" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Use your org name for signup and optional org name for login if you manage multiple orgs.
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
  );
}
