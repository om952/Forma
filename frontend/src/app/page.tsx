"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [formId, setFormId] = useState("");

  const handleAnalytics = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = formId.trim();
    if (trimmed) {
      router.push(`/analytics/${trimmed}`);
    }
  };

  const features = [
    {
      title: "Drag-and-Drop Builder",
      description: "Text, select, file fields, and conditional rules with no code.",
      icon: "🧱",
      href: "/builder",
    },
    {
      title: "Conditional Logic",
      description: "Show or hide fields based on answers for dynamic forms.",
      icon: "⚡",
      href: "/builder",
    },
    {
      title: "File Uploads",
      description: "Collect files securely with local disk storage and validation.",
      icon: "📎",
      href: "/builder",
    },
    {
      title: "Webhook Integrations",
      description: "Send submissions to Slack, Zapier, or any custom endpoint.",
      icon: "🔌",
      href: "/dashboard",
    },
    {
      title: "Rich Analytics",
      description: "Track drop-off rates, field heatmaps, and response trends.",
      icon: "📊",
      href: "/dashboard",
    },
    {
      title: "Subscription Billing",
      description: "Razorpay-powered premium plans with test-mode support.",
      icon: "💳",
      href: "/billing",
    },
  ];

  return (
    <div className="page-bg">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-16 pt-16">
        <div className="mx-auto max-w-5xl text-center">
          <span className="eyebrow">Forma — Multi-Tenant Form Builder</span>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
            Build beautiful forms.
            <br className="hidden sm:block" />
            Capture better data.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            A multi-tenant SaaS form builder with conditional logic, file uploads,
            webhooks, analytics, and subscription billing.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth" className="btn-primary min-w-[160px]">
              Get Started
            </Link>
            <Link href="/builder" className="btn-secondary min-w-[160px]">
              Try Builder
            </Link>
          </div>
        </div>
      </section>

      {/* Analytics lookup */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-2xl">
          <form onSubmit={handleAnalytics} className="card-elevated">
            <h3 className="text-lg font-semibold text-slate-900">View Analytics</h3>
            <p className="mt-2 text-sm text-slate-600">
              Paste a public form ID to see its submissions and insights.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                className="input"
                placeholder="Form ID"
                value={formId}
                onChange={(event) => setFormId(event.target.value)}
              />
              <button type="submit" className="btn-primary shrink-0">
                Open analytics
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Explore the platform</h2>
            <p className="mt-3 text-slate-600">
              Everything you need to collect, route, and analyze form submissions.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Link
                key={feature.title}
                href={feature.href}
                className="card-elevated transition hover:-translate-y-1"
              >
                <div className="mb-4 text-3xl">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-4xl">
          <div className="card-elevated flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Ready to build your first form?</h2>
              <p className="mt-2 text-sm text-slate-600">Sign up for free and start collecting responses in minutes.</p>
            </div>
            <Link href="/auth" className="btn-primary">
              Create Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
