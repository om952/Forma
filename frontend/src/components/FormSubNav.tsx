"use client";

import Link from "next/link";

type Tab = "builder" | "responses" | "analytics" | "webhooks" | "share";

const TABS: Array<{ key: Tab; label: string; href: (formId: string) => string }> = [
  { key: "builder", label: "Builder", href: (id) => `/builder?formId=${id}` },
  { key: "responses", label: "Responses", href: (id) => `/responses/${id}` },
  { key: "analytics", label: "Analytics", href: (id) => `/analytics/${id}` },
  { key: "webhooks", label: "Webhooks", href: (id) => `/webhooks/${id}` },
  { key: "share", label: "Share", href: (id) => `/share/${id}` },
];

/**
 * Tab strip for moving between a single form's tools without going back to
 * the dashboard. This is the piece that actually connects the per-form pages
 * into one flow rather than five separate dead ends.
 */
export default function FormSubNav({
  formId,
  active,
  formName,
}: {
  formId: string;
  active: Tab;
  formName?: string;
}) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center justify-between">
          {formName ? (
            <p className="truncate py-3 text-sm font-medium text-slate-500">
              {formName}
            </p>
          ) : (
            <span />
          )}
          <nav className="flex gap-6">
            {TABS.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href(formId)}
                className={tab.key === active ? "subnav-tab-active" : "subnav-tab"}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
