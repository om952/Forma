"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AuthCard from "../../components/AuthCard";
import { apiJson, errorMessage } from "../../lib/api";
import { getAuthUser, setAuthUser, useAuthToken } from "../../lib/auth";
import { useFragmentToken } from "../../lib/useFragmentToken";

type Result = { ok: true; message: string } | { ok: false; message: string };

/**
 * Tokens are single-use, so each is sent once per page load even though React
 * runs effects twice in development.
 */
const attempts = new Map<string, Promise<Result>>();

const verifyOnce = (token: string) => {
  let attempt = attempts.get(token);
  if (!attempt) {
    attempt = apiJson<{ message: string }>("/api/auth/verify-email", { body: { token } })
      .then((data): Result => ({ ok: true, message: data.message }))
      .catch((error): Result => ({ ok: false, message: errorMessage(error) }));
    attempts.set(token, attempt);
  }
  return attempt;
};

export default function VerifyEmailPage() {
  const token = useFragmentToken();
  const session = useAuthToken();
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    verifyOnce(token).then((outcome) => {
      if (cancelled) return;
      setResult(outcome);

      // Clears the "confirm your email" banner in this browser straight away.
      const user = getAuthUser();
      if (outcome.ok && user && !user.emailVerified) {
        setAuthUser({ ...user, emailVerified: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const next = session ? (
    <Link href="/dashboard" className="btn-primary inline-block">
      Go to dashboard
    </Link>
  ) : (
    <Link href="/auth" className="btn-primary inline-block">
      Sign in
    </Link>
  );

  if (token === "") {
    return (
      <AuthCard eyebrow="Email" title="Link incomplete">
        <p className="text-sm text-slate-600">
          This confirmation link is missing its code. Open the full link from your
          email, or request a new one from your account page.
        </p>
        {next}
      </AuthCard>
    );
  }

  if (!result) {
    return (
      <AuthCard eyebrow="Email" title="Confirming your email…">
        <p className="text-sm text-slate-500">One moment.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Email"
      title={result.ok ? "Email confirmed" : "Couldn't confirm your email"}
    >
      <div className={result.ok ? "status-success" : "status-error"}>
        {result.message}
      </div>
      {next}
    </AuthCard>
  );
}
