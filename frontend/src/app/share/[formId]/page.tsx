"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import AppHeader from "../../../components/AppHeader";
import FormSubNav from "../../../components/FormSubNav";
import { apiFetch } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth";

type FormSummary = {
  name: string;
  isActive: boolean;
};

export default function SharePage() {
  const params = useParams<{ formId?: string }>();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const [form, setForm] = useState<FormSummary | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getAuthToken());
    // origin is only available in the browser, so build the URL after mount.
    if (formId) {
      setPublicUrl(`${window.location.origin}/form/${formId}`);
    }
  }, [formId]);

  useEffect(() => {
    const fetchForm = async () => {
      if (!formId || !token) {
        setLoading(false);
        return;
      }

      try {
        const response = await apiFetch(`/api/forms/${formId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load form");
        }
        setForm((await response.json()) as FormSummary);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Error");
      } finally {
        setLoading(false);
      }
    };

    fetchForm();
  }, [formId, token]);

  useEffect(() => {
    if (!publicUrl) return;

    QRCode.toDataURL(publicUrl, {
      width: 320,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setStatus("Could not generate the QR code."));
  }, [publicUrl]);

  const embedSnippet = publicUrl
    ? `<iframe src="${publicUrl}" width="100%" height="600" style="border:none;"></iframe>`
    : "";

  const handleCopy = async (value: string, which: "link" | "embed") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setStatus("Could not copy — copy it manually instead.");
    }
  };

  if (loading) {
    return (
      <div className="page-bg flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="page-bg flex items-center justify-center px-6">
        <div className="card-elevated w-full max-w-md text-center">
          <p className="text-slate-600">Please sign in to share this form.</p>
          <Link href="/auth" className="btn-primary mt-4 inline-block">
            Go to Auth
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-bg">
      <AppHeader />
      <FormSubNav formId={formId} active="share" formName={form?.name} />
      <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Share {form?.name ?? "form"}
          </h1>
          <p className="text-sm text-slate-500">
            Anyone with this link can fill in the form — no account needed.
          </p>
        </div>

        {status ? <div className="status-error mb-6">{status}</div> : null}

        {form && !form.isActive ? (
          <div className="status-info mb-6">
            This form is currently disabled, so the link will not accept
            submissions. Enable it from the dashboard.
          </div>
        ) : null}

        <div className="card-elevated">
          <label className="label">Public link</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={publicUrl} className="input flex-1" />
            <button
              onClick={() => handleCopy(publicUrl, "link")}
              className="btn-primary whitespace-nowrap"
            >
              {copied === "link" ? "Copied!" : "Copy link"}
            </button>
          </div>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-medium text-slate-500 underline hover:text-slate-700"
          >
            Open in a new tab
          </a>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="card-elevated text-center">
            <h2 className="text-lg font-semibold text-slate-900">QR code</h2>
            <p className="mt-1 text-sm text-slate-600">
              Print it or drop it on a slide.
            </p>
            {qrDataUrl ? (
              <>
                {/* Plain <img>: the QR is a runtime-generated data URI, which
                    next/image cannot optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR code linking to ${form?.name ?? "the form"}`}
                  className="mx-auto mt-4 h-48 w-48 rounded-xl border border-slate-200"
                />
                <a
                  href={qrDataUrl}
                  download={`${form?.name ?? "form"}-qr.png`}
                  className="btn-secondary mt-4 inline-block"
                >
                  Download PNG
                </a>
              </>
            ) : (
              <div className="mx-auto mt-4 flex h-48 w-48 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                Generating...
              </div>
            )}
          </div>

          <div className="card-elevated">
            <h2 className="text-lg font-semibold text-slate-900">Embed</h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste this into any HTML page.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <code>{embedSnippet}</code>
            </pre>
            <button
              onClick={() => handleCopy(embedSnippet, "embed")}
              className="btn-secondary mt-4 w-full"
            >
              {copied === "embed" ? "Copied!" : "Copy embed code"}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
