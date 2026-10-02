"use client";

import { useEffect, useState } from "react";

import { apiJson, errorMessage } from "../lib/api";
import { auditActor, describeAuditEntry, type AuditEntry } from "../lib/auditLog";

type Page = { items: AuditEntry[]; nextCursor: string | null };

const PAGE_SIZE = 15;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Recent sensitive changes to the organization: roles, removals, webhooks and
 * billing. Owners and admins only. `refreshKey` reloads it after this page
 * itself changes something.
 */
export default function ActivityLog({ token, refreshKey }: { token: string; refreshKey: number }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiJson<Page>(`/api/org/audit-log?limit=${PAGE_SIZE}`, { token })
      .then((page) => {
        if (cancelled) return;
        setEntries(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await apiJson<Page>(
        `/api/org/audit-log?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        { token }
      );
      setEntries((prev) => [...(prev ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="card-elevated mt-6" data-testid="activity-log">
      <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
      <p className="mt-1 text-sm text-slate-600">
        Role changes, removals, webhook edits and plan changes, newest first.
      </p>

      {error ? <div className="status-error mt-4">{error}</div> : null}

      {!entries ? (
        <p className="mt-4 text-sm text-slate-500">Loading activity…</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nothing yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3" data-testid="activity-entry">
              <div className="min-w-0">
                <p className="text-sm text-slate-900">{describeAuditEntry(entry)}</p>
                <p className="text-xs text-slate-500">{auditActor(entry)}</p>
              </div>
              <time className="text-xs text-slate-400" dateTime={entry.createdAt}>
                {when(entry.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="mt-2 text-center">
          <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older activity"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
