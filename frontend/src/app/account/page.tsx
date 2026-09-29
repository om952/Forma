"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AppHeader from "../../components/AppHeader";
import { apiJson, errorMessage } from "../../lib/api";
import {
  ROLE_LABELS,
  clearAuthToken,
  setAuthToken,
  useAuthToken,
  useAuthUser,
} from "../../lib/auth";

type Feedback = { kind: "success" | "error"; message: string } | null;

const FeedbackBox = ({ feedback }: { feedback: Feedback }) =>
  feedback ? (
    <div className={feedback.kind === "success" ? "status-success" : "status-error"}>
      {feedback.message}
    </div>
  ) : null;

export default function AccountPage() {
  const router = useRouter();
  const token = useAuthToken();
  const user = useAuthUser();

  const [orgName, setOrgName] = useState<string | null>(null);
  const [verifyFeedback, setVerifyFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [sessionFeedback, setSessionFeedback] = useState<Feedback>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    apiJson<{ organization: { name: string } }>("/api/auth/me", { token })
      .then((me) => {
        if (!cancelled) setOrgName(me.organization.name);
      })
      .catch(() => {
        // AppHeader handles an expired session.
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const resendVerification = async () => {
    setVerifyFeedback(null);
    try {
      const data = await apiJson<{ message: string }>("/api/auth/resend-verification", {
        token,
        method: "POST",
      });
      setVerifyFeedback({ kind: "success", message: data.message });
    } catch (error) {
      setVerifyFeedback({ kind: "error", message: errorMessage(error) });
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordFeedback(null);

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ kind: "error", message: "The new passwords don't match." });
      return;
    }

    setBusy(true);
    try {
      const data = await apiJson<{ message: string; token: string }>(
        "/api/auth/change-password",
        { token, body: { currentPassword, newPassword } }
      );
      // The old token was revoked with every other session; keep this one.
      setAuthToken(data.token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({ kind: "success", message: data.message });
    } catch (error) {
      setPasswordFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    if (!window.confirm("Sign out of Forma on every device, including this one?")) return;

    setSessionFeedback(null);
    try {
      await apiJson("/api/auth/logout-all", { token, method: "POST" });
      clearAuthToken();
      router.push("/auth");
    } catch (error) {
      setSessionFeedback({ kind: "error", message: errorMessage(error) });
    }
  };

  return (
    <div className="page-bg">
      <AppHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <p className="eyebrow">Account</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Your account
          </h1>
        </header>

        {!token || !user ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">Please sign in to manage your account.</p>
            <Link href="/auth" className="btn-primary mt-4 inline-block">
              Go to sign in
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="card-elevated space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500">Email</dt>
                  <dd className="mt-1 break-all font-medium text-slate-900">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Organization</dt>
                  <dd className="mt-1 font-medium text-slate-900">{orgName ?? "…"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Role</dt>
                  <dd className="mt-1 font-medium text-slate-900">{ROLE_LABELS[user.role]}</dd>
                </div>
              </dl>

              {user.emailVerified === false ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>Your email address isn&apos;t confirmed yet.</span>
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={resendVerification}
                  >
                    Send a new confirmation link
                  </button>
                </div>
              ) : user.emailVerified ? (
                <p className="text-sm text-emerald-700">✓ Email confirmed</p>
              ) : null}
              <FeedbackBox feedback={verifyFeedback} />
            </section>

            <section className="card-elevated">
              <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
              <p className="mt-1 text-sm text-slate-600">
                You stay signed in here; every other device is signed out.
              </p>
              <form className="mt-4 space-y-4" onSubmit={changePassword}>
                <label className="label block">
                  Current password
                  <input
                    className="input mt-2"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="label block">
                  New password
                  <input
                    className="input mt-2"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
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
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <button className="btn-primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Change password"}
                </button>
                <FeedbackBox feedback={passwordFeedback} />
              </form>
            </section>

            <section className="card-elevated space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Sessions</h2>
              <p className="text-sm text-slate-600">
                Lost a device, or signed in somewhere you shouldn&apos;t have? Sign out
                everywhere at once.
              </p>
              <button type="button" className="btn-secondary text-rose-600" onClick={signOutEverywhere}>
                Sign out of all devices
              </button>
              <FeedbackBox feedback={sessionFeedback} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
