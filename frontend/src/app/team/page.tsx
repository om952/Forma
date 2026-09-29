"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppHeader from "../../components/AppHeader";
import { apiJson, errorMessage } from "../../lib/api";
import {
  ROLE_LABELS,
  canChangeRoles,
  canManageMembers,
  canRemoveMember,
  invitableRoles,
  setAuthUser,
  useAuthToken,
  useAuthUser,
  type AuthUser,
  type OrgRole,
} from "../../lib/auth";

type Member = {
  id: string;
  email: string;
  name: string | null;
  role: OrgRole;
  emailVerified: boolean;
  createdAt: string;
};

type Invite = {
  id: string;
  email: string;
  role: OrgRole;
  emailed: boolean;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
};

type CreateInviteResponse = { invite: Invite; inviteUrl?: string };

const ALL_ROLES: OrgRole[] = ["OWNER", "ADMIN", "MEMBER"];

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const RoleBadge = ({ role }: { role: OrgRole }) => (
  <span
    className={`rounded-full px-3 py-1 text-xs font-semibold ${
      role === "OWNER"
        ? "bg-indigo-50 text-indigo-700"
        : role === "ADMIN"
          ? "bg-sky-50 text-sky-700"
          : "bg-slate-100 text-slate-600"
    }`}
  >
    {ROLE_LABELS[role]}
  </span>
);

export default function TeamPage() {
  const token = useAuthToken();
  const user = useAuthUser();
  const manage = canManageMembers(user);
  const roleOptions = invitableRoles(user);

  const [orgName, setOrgName] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<{ email: string; url: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("MEMBER");
  const [busy, setBusy] = useState(false);
  // An admin can only pick MEMBER, whatever was last selected.
  const selectedInviteRole = roleOptions.includes(inviteRole) ? inviteRole : "MEMBER";

  const refresh = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const load = async () => {
      try {
        const [me, memberList, inviteList] = await Promise.all([
          apiJson<{ organization: { name: string } }>("/api/auth/me", { token }),
          apiJson<Member[]>("/api/org/members", { token }),
          manage ? apiJson<Invite[]>("/api/org/invites", { token }) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setOrgName(me.organization.name);
        setMembers(memberList);
        setInvites(inviteList);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token, manage, refreshKey]);

  /** Runs an action, shows its outcome, reloads the lists. True if it worked. */
  const run = async (action: () => Promise<string | null>) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      setNotice(await action());
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const sendInvite = (email: string, role: OrgRole) =>
    run(async () => {
      const data = await apiJson<CreateInviteResponse>("/api/org/invites", {
        token,
        body: { email, role },
      });
      if (data.inviteUrl) {
        setShareLink({ email: data.invite.email, url: data.inviteUrl });
        return null;
      }
      setShareLink(null);
      return `Invitation emailed to ${data.invite.email}.`;
    });

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await sendInvite(inviteEmail, selectedInviteRole)) setInviteEmail("");
  };

  const changeRole = (member: Member, role: OrgRole) =>
    run(async () => {
      await apiJson(`/api/org/members/${member.id}`, {
        token,
        method: "PATCH",
        body: { role },
      });

      // Changing your own role changes what this page may show.
      if (member.id === user?.id) {
        const me = await apiJson<{ user: AuthUser }>("/api/auth/me", { token });
        setAuthUser(me.user);
      }

      return `${member.name ?? member.email} is now ${ROLE_LABELS[role].toLowerCase()}.`;
    });

  const removeMember = (member: Member) => {
    const who = member.name ?? member.email;
    if (!window.confirm(`Remove ${who}? Their account is deleted and forms they created move to you.`)) {
      return;
    }
    return run(async () => {
      await apiJson(`/api/org/members/${member.id}`, { token, method: "DELETE" });
      return `${who} was removed.`;
    });
  };

  const revokeInvite = (invite: Invite) =>
    run(async () => {
      await apiJson(`/api/org/invites/${invite.id}`, { token, method: "DELETE" });
      if (shareLink?.email === invite.email) setShareLink(null);
      return `Invitation to ${invite.email} withdrawn.`;
    });

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink.url);
      setNotice("Invite link copied.");
    } catch {
      setError("Couldn't copy automatically. Select the link and copy it instead.");
    }
  };

  return (
    <div className="page-bg">
      <AppHeader />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <p className="eyebrow">Team</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {orgName ?? "Your organization"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Owners change roles. Owners and admins invite people, manage billing
            and webhooks, and delete forms; admins can remove members. Members
            build forms and read responses.
          </p>
        </header>

        {error ? <div className="status-error mb-6">{error}</div> : null}
        {notice ? <div className="status-success mb-6">{notice}</div> : null}

        {!token ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">Please sign in to see your team.</p>
            <Link href="/auth" className="btn-primary mt-4 inline-block">
              Go to sign in
            </Link>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <section className="card-elevated lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Members{members ? ` (${members.length})` : ""}
              </h2>

              {!members ? (
                <p className="mt-4 text-sm text-slate-500">Loading members…</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                      data-testid="member-row"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {member.name ?? member.email}
                          {member.id === user?.id ? (
                            <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {member.name ? `${member.email} · ` : ""}
                          joined {formatDate(member.createdAt)}
                          {member.emailVerified ? "" : " · email not confirmed"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {canChangeRoles(user) ? (
                          <select
                            className="input w-auto py-1.5 text-xs"
                            value={member.role}
                            disabled={busy}
                            aria-label={`Role for ${member.email}`}
                            onChange={(event) =>
                              changeRole(member, event.target.value as OrgRole)
                            }
                          >
                            {ALL_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <RoleBadge role={member.role} />
                        )}

                        {canRemoveMember(user, member) ? (
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs text-rose-600"
                            disabled={busy}
                            onClick={() => removeMember(member)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {manage ? (
              <div className="space-y-6">
                <section className="card-elevated">
                  <h2 className="text-lg font-semibold text-slate-900">Invite someone</h2>
                  <form className="mt-4 space-y-4" onSubmit={handleInvite}>
                    <label className="label block">
                      Email
                      <input
                        className="input mt-2"
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        required
                      />
                    </label>
                    <label className="label block">
                      Role
                      <select
                        className="input mt-2"
                        value={selectedInviteRole}
                        onChange={(event) => setInviteRole(event.target.value as OrgRole)}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="btn-primary w-full" type="submit" disabled={busy}>
                      {busy ? "Working…" : "Send invitation"}
                    </button>
                  </form>

                  {shareLink ? (
                    <div className="status-info mt-4 space-y-3" data-testid="invite-link">
                      <p>
                        Email isn&apos;t set up on this server, so send this link to{" "}
                        <strong>{shareLink.email}</strong> yourself. It works once and
                        expires in 7 days.
                      </p>
                      <input
                        className="input text-xs"
                        value={shareLink.url}
                        readOnly
                        onFocus={(event) => event.target.select()}
                      />
                      <button type="button" className="btn-secondary w-full" onClick={copyShareLink}>
                        Copy link
                      </button>
                    </div>
                  ) : null}
                </section>

                <section className="card-elevated">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Pending invitations
                  </h2>
                  {invites.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">None right now.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {invites.map((invite) => (
                        <li key={invite.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {invite.email}
                            </p>
                            <RoleBadge role={invite.role} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {invite.emailed ? "Emailed" : "Link shared"} · expires{" "}
                            {formatDate(invite.expiresAt)}
                            {invite.invitedBy ? ` · by ${invite.invitedBy}` : ""}
                          </p>
                          {roleOptions.includes(invite.role) ? (
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                className="btn-secondary px-3 py-1.5 text-xs"
                                disabled={busy}
                                onClick={() => sendInvite(invite.email, invite.role)}
                              >
                                Resend
                              </button>
                              <button
                                type="button"
                                className="btn-secondary px-3 py-1.5 text-xs text-rose-600"
                                disabled={busy}
                                onClick={() => revokeInvite(invite)}
                              >
                                Revoke
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
