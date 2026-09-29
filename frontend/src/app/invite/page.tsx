"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthCard from "../../components/AuthCard";
import { apiJson, errorMessage } from "../../lib/api";
import {
  ROLE_LABELS,
  setAuthToken,
  setAuthUser,
  type AuthUser,
  type OrgRole,
} from "../../lib/auth";
import { useFragmentToken } from "../../lib/useFragmentToken";

type InviteDetails = {
  email: string;
  role: OrgRole;
  organization: { name: string };
  invitedBy: string | null;
  expiresAt: string;
};

type Lookup =
  | { state: "loading" }
  | { state: "ready"; invite: InviteDetails }
  | { state: "error"; message: string };

export default function InvitePage() {
  const router = useRouter();
  const token = useFragmentToken();
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    apiJson<InviteDetails>("/api/invites/lookup", { body: { token } })
      .then((invite) => {
        if (!cancelled) setLookup({ state: "ready", invite });
      })
      .catch((error) => {
        if (!cancelled) setLookup({ state: "error", message: errorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);

    if (password !== confirm) {
      setStatus("The passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiJson<{ token: string; user: AuthUser }>(
        "/api/invites/accept",
        { body: { token, password, name: name.trim() || undefined } }
      );
      setAuthToken(data.token);
      setAuthUser(data.user);
      router.push("/dashboard");
    } catch (error) {
      setStatus(errorMessage(error));
      setSubmitting(false);
    }
  };

  // No token in the URL: the link was truncated or opened without its fragment.
  if (token === "") {
    return (
      <AuthCard eyebrow="Invitation" title="Link incomplete">
        <p className="text-sm text-slate-600">
          This invitation link is missing its code. Open the full link from your
          email, or ask whoever invited you to send it again.
        </p>
      </AuthCard>
    );
  }

  if (token === null || lookup.state === "loading") {
    return (
      <AuthCard eyebrow="Invitation" title="Checking your invitation…">
        <p className="text-sm text-slate-500">One moment.</p>
      </AuthCard>
    );
  }

  if (lookup.state === "error") {
    return (
      <AuthCard eyebrow="Invitation" title="Can't use this invitation">
        <div className="status-error">{lookup.message}</div>
        <Link href="/auth" className="btn-secondary inline-block">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  const { invite } = lookup;

  return (
    <AuthCard
      eyebrow="Invitation"
      title={`Join ${invite.organization.name}`}
      description={
        <>
          {invite.invitedBy ?? "Someone"} invited you to join as{" "}
          <strong>{ROLE_LABELS[invite.role].toLowerCase()}</strong>. Choose a
          password to create your account.
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="label block">
          Email
          <input className="input mt-2 bg-slate-50" value={invite.email} readOnly />
        </label>

        <label className="label block">
          Your name <span className="font-normal text-slate-400">(optional)</span>
          <input
            className="input mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            autoComplete="name"
          />
        </label>

        <label className="label block">
          Password
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
          Confirm password
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

        <button className="btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? "Joining…" : `Join ${invite.organization.name}`}
        </button>

        {status ? <div className="status-error">{status}</div> : null}
      </form>
    </AuthCard>
  );
}
