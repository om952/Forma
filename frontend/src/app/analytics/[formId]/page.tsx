"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import AppHeader from "../../../components/AppHeader";
import {
  DailyColumns,
  DropOffTable,
  Heatmap,
  StatTile,
  formatDay,
  formatDuration,
  formatNumber,
  type FieldAnalytics,
} from "../../../components/AnalyticsCharts";
import FormSubNav from "../../../components/FormSubNav";
import LoadError from "../../../components/LoadError";
import { ApiError, apiJson, errorMessage } from "../../../lib/api";
import { useAuthToken } from "../../../lib/auth";
import { useBrowserValue } from "../../../lib/useBrowserValue";

type Analytics = {
  formId: string;
  totalResponses: number;
  range: { days: number; timeZone: string; from: string; to: string };
  responses: number;
  funnel: {
    views: number;
    starts: number;
    completions: number;
    abandoned: number;
    startRate: number | null;
    completionRate: number | null;
    medianSecondsToComplete: number | null;
  };
  fields: FieldAnalytics[];
  series: Array<{ date: string; count: number }>;
  heatmap: { weekdays: string[]; cells: number[][]; max: number };
};

const RANGES = [7, 30, 90] as const;

const rateText = (rate: number | null, of: string) =>
  rate === null ? `no ${of} yet` : `${rate}% of ${of}`;

export default function AnalyticsPage() {
  const params = useParams<{ formId?: string }>();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const token = useAuthToken();
  // Counted in the viewer's own calendar. Unknown until the browser renders.
  const timeZone = useBrowserValue<string | null>(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    null
  );

  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!formId || !token || !timeZone) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiJson<Analytics>(
          `/api/analytics/${formId}?days=${days}&timeZone=${encodeURIComponent(timeZone)}`,
          { token }
        );
        if (cancelled) return;
        setAnalytics(data);
        setStatus(null);
      } catch (error) {
        if (cancelled) return;
        // Free tier: an upgrade prompt rather than a generic error.
        if (error instanceof ApiError && error.code === "UPGRADE_REQUIRED") {
          setUpgradeRequired(true);
        } else {
          setStatus(errorMessage(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [formId, token, timeZone, days, reloadKey]);

  const funnel = analytics?.funnel;
  const untracked = analytics && analytics.funnel.views === 0 && analytics.responses > 0;

  return (
    <div className="page-bg">
      <AppHeader />
      <FormSubNav formId={formId} active="analytics" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header>
          <p className="eyebrow">Analytics</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Form insights</h1>
          <p className="text-sm text-slate-600">
            Who opens the form, where they give up, and when responses arrive.
          </p>
        </header>

        {!token ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">Please sign in to view analytics.</p>
            <Link href="/auth" className="btn-primary mt-4 inline-block">
              Go to sign in
            </Link>
          </div>
        ) : upgradeRequired ? (
          <div className="card-elevated mx-auto max-w-xl text-center">
            <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Premium feature
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Unlock analytics</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              See where respondents drop off, how many finish, and when submissions
              arrive. Upgrade your organisation to Premium to turn it on.
            </p>
            <Link href="/billing" className="btn-primary mt-6 inline-block">
              Upgrade to Premium
            </Link>
          </div>
        ) : (
          <>
            {/* One filter row, scoping everything below it. */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Date range">
                {RANGES.map((range) => (
                  <button
                    key={range}
                    type="button"
                    aria-pressed={days === range}
                    onClick={() => setDays(range)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      days === range ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Last {range} days
                  </button>
                ))}
              </div>
              {analytics ? (
                <p className="text-xs text-slate-500">
                  {formatDay(analytics.range.from)} – {formatDay(analytics.range.to)} · {analytics.range.timeZone}
                </p>
              ) : null}
            </div>

            {/* Before anything has loaded, a failure replaces the page; after, it sits above the last good data. */}
            {!analytics && status && !loading ? (
              <LoadError message={status} onRetry={() => setReloadKey((key) => key + 1)} />
            ) : status ? (
              <div className="status-error">{status}</div>
            ) : null}

            {!analytics ? (
              status && !loading ? null : (
                <div className="card-elevated p-10 text-center">
                  <p className="text-slate-500">{loading ? "Loading analytics…" : "No analytics to show."}</p>
                </div>
              )
            ) : (
              // A refetch keeps the previous render, dimmed, instead of flashing.
              <div className={`flex flex-col gap-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="kpis">
                  <StatTile
                    label="Responses"
                    value={formatNumber(analytics.responses)}
                    detail={`${formatNumber(analytics.totalResponses)} all time`}
                  />
                  <StatTile label="Views" value={formatNumber(funnel!.views)} detail="times the form was opened" />
                  <StatTile
                    label="Started"
                    value={formatNumber(funnel!.starts)}
                    detail={rateText(funnel!.startRate, "views")}
                  />
                  <StatTile
                    label="Completed"
                    value={formatNumber(funnel!.completions)}
                    detail={rateText(funnel!.completionRate, "starts")}
                  />
                  <StatTile
                    label="Median time to complete"
                    value={
                      funnel!.medianSecondsToComplete === null
                        ? "—"
                        : formatDuration(funnel!.medianSecondsToComplete)
                    }
                    detail="first field to submit"
                  />
                </section>

                {untracked ? (
                  <div className="status-info">
                    Views and drop-off are counted from visits to the form page, and none
                    were recorded in this period. Responses sent before visit tracking was
                    switched on, or through the API, appear only in the response counts.
                  </div>
                ) : null}

                <section className="card-elevated">
                  <h2 className="text-lg font-semibold text-slate-900">Where people drop off</h2>
                  <p className="mb-4 mt-1 text-sm text-slate-600">
                    Of the people who reached each field, the share who left the form
                    there.{" "}
                    {funnel!.abandoned === 1
                      ? "1 visit was abandoned"
                      : `${formatNumber(funnel!.abandoned)} visits were abandoned`}{" "}
                    (no activity for 30 minutes). Skipped counts submissions that showed
                    the field but left it blank.
                  </p>
                  {analytics.fields.length ? (
                    <DropOffTable fields={analytics.fields} />
                  ) : (
                    <p className="text-sm text-slate-500">This form has no fields yet.</p>
                  )}
                </section>

                <section className="card-elevated">
                  <h2 className="text-lg font-semibold text-slate-900">Responses per day</h2>
                  <p className="mb-4 mt-1 text-sm text-slate-600">
                    {formatNumber(analytics.responses)} in the last {analytics.range.days} days.
                  </p>
                  <DailyColumns series={analytics.series} />
                </section>

                <section className="card-elevated">
                  <h2 className="text-lg font-semibold text-slate-900">When responses arrive</h2>
                  <p className="mb-4 mt-1 text-sm text-slate-600">
                    Submissions by weekday and hour of day, over the same period.
                  </p>
                  <Heatmap
                    weekdays={analytics.heatmap.weekdays}
                    cells={analytics.heatmap.cells}
                    max={analytics.heatmap.max}
                    timeZone={analytics.range.timeZone}
                  />
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
