"use client";

import Link from "next/link";
import { useState } from "react";

import AuthCard from "../../components/AuthCard";
import { apiJson, errorMessage } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await apiJson<{ message: string }>("/api/auth/forgot-password", {
        body: {
          email,
          organizationName: organizationName.trim() || undefined,
        },
      });
      setSent(data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthCard eyebrow="Password reset" title="Check your email">
        <div className="status-success">{sent}</div>
        <p className="text-sm text-slate-600">
          The link expires in 1 hour. If nothing arrives, check your spam folder
          or try again in a minute.
        </p>
        <Link href="/auth" className="btn-secondary inline-block">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Password reset"
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to choose a new one."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="label block">
          Email
          <input
            className="input mt-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="label block">
          Organization name{" "}
          <span className="font-normal text-slate-400">(optional)</span>
          <input
            className="input mt-2"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="Only if you belong to more than one"
          />
        </label>

        <button className="btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>

        {error ? <div className="status-error">{error}</div> : null}

        <p className="text-center text-sm text-slate-500">
          Remembered it?{" "}
          <Link href="/auth" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
