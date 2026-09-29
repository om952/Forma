"use client";

import Link from "next/link";
import { useState } from "react";

import AuthCard from "../../components/AuthCard";
import { apiJson, errorMessage } from "../../lib/api";
import { clearAuthToken } from "../../lib/auth";
import { useFragmentToken } from "../../lib/useFragmentToken";

export default function ResetPasswordPage() {
  const token = useFragmentToken();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiJson<{ message: string }>("/api/auth/reset-password", {
        body: { token, password },
      });
      // Every session, including one in this browser, was just signed out.
      clearAuthToken();
      setDone(data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthCard eyebrow="Password reset" title="Password updated">
        <div className="status-success">{done}</div>
        <p className="text-sm text-slate-600">
          For your security, you&apos;ve been signed out on every device.
        </p>
        <Link href="/auth" className="btn-primary inline-block">
          Sign in
        </Link>
      </AuthCard>
    );
  }

  if (token === "") {
    return (
      <AuthCard eyebrow="Password reset" title="Link incomplete">
        <p className="text-sm text-slate-600">
          This reset link is missing its code. Open the full link from your email,
          or request a new one.
        </p>
        <Link href="/forgot-password" className="btn-secondary inline-block">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Password reset"
      title="Choose a new password"
      description="At least 8 characters. You'll be signed out everywhere else."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="label block">
          New password
          <input
            className="input mt-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>

        <label className="label block">
          Confirm new password
          <input
            className="input mt-2"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>

        <button
          className="btn-primary w-full"
          type="submit"
          disabled={submitting || token === null}
        >
          {submitting ? "Saving…" : "Set new password"}
        </button>

        {error ? (
          <div className="status-error">
            {error}{" "}
            <Link href="/forgot-password" className="font-semibold underline">
              Request a new link
            </Link>
          </div>
        ) : null}
      </form>
    </AuthCard>
  );
}
