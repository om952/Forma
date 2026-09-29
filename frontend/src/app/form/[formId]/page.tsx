"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../../lib/api";
import { isFieldVisible, type FormField } from "../../../stores/formBuilderStore";

type FormResponse = {
  id: string;
  name: string;
  schema: FormField[];
  thankYouMessage?: string | null;
  isActive: boolean;
};

type FileMap = Record<string, File>;

// Mirrors the server's allowlist (backend/src/utils/fileType.ts). A hint for
// the file picker only — the server checks the file's bytes regardless.
const UPLOAD_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.txt,.csv";

/*
 * Visit tracking for the form owner's analytics: when the form was opened,
 * which fields the respondent reached, and whether they submitted. Anonymous
 * (a random visit id, nothing else), and never allowed to get in the way of
 * filling in the form: every failure is ignored.
 */

const visitKey = (formId: string) => `forma:visit:${formId}`;

/** One visit per fill; React runs effects twice in development. */
const visits = new Map<string, Promise<string | null>>();

const startVisit = (formId: string): Promise<string | null> => {
  let visit = visits.get(formId);
  if (!visit) {
    visit = (async () => {
      // A reload carries on the same visit rather than counting a new one.
      try {
        const stored = window.sessionStorage.getItem(visitKey(formId));
        if (stored) return stored;
      } catch {
        // Storage can be unavailable (private mode); a visit per load is fine.
      }

      const response = await apiFetch(`/api/forms/${formId}/sessions`, {
        method: "POST",
      }).catch(() => null);
      if (!response?.ok) return null;

      const { sessionId } = (await response.json()) as { sessionId: string };
      try {
        window.sessionStorage.setItem(visitKey(formId), sessionId);
      } catch {
        // See above.
      }
      return sessionId;
    })().catch(() => null);
    visits.set(formId, visit);
  }
  return visit;
};

const endVisit = (formId: string) => {
  visits.delete(formId);
  try {
    window.sessionStorage.removeItem(visitKey(formId));
  } catch {
    // See startVisit.
  }
};

export default function PublicFormPage() {
  const params = useParams<{ formId?: string }>();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const [form, setForm] = useState<FormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<FileMap>({});
  // Fields already reported for this visit.
  const reachedFields = useRef(new Set<string>());

  useEffect(() => {
    const fetchForm = async () => {
      if (!formId) {
        setStatus("Form ID is missing");
        setLoading(false);
        return;
      }

      try {
        const response = await apiFetch(`/api/forms/${formId}/public`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "Form not found");
        }
        const data = (await response.json()) as FormResponse;
        setForm(data);
        void startVisit(formId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setStatus(message);
      } finally {
        setLoading(false);
      }
    };

    fetchForm();
  }, [formId]);

  const reportFieldReached = (fieldId: string) => {
    if (reachedFields.current.has(fieldId)) return;
    reachedFields.current.add(fieldId);

    void startVisit(formId).then((sessionId) => {
      if (!sessionId) return;
      return apiFetch(`/api/forms/${formId}/sessions/${sessionId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId }),
      }).catch(() => undefined);
    });
  };

  // Returns the stored file's URL, or throws with a message the respondent can
  // act on (e.g. the server refusing the file type).
  const uploadFile = async (file: File): Promise<string> => {
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result?.toString().split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });

    // No auth header: respondents are anonymous. The endpoint authorises the
    // upload by checking the form itself is real and accepting submissions.
    // No file type is sent: the server reads it from the bytes.
    const response = await apiFetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formId,
        fileName: file.name,
        fileData: base64,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      throw new Error(
        `Could not upload "${file.name}". ${body?.message ?? "Please try again."}`
      );
    }

    const result = (await response.json()) as { fileUrl: string };
    return result.fileUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId) return;

    setStatus(null);
    try {
      const payload = { ...formData };

      // Fail loudly: silently submitting the filename would look like success
      // while losing the file for good.
      for (const [fieldId, file] of Object.entries(files)) {
        payload[fieldId] = await uploadFile(file);
      }

      const sessionId = await startVisit(formId);
      const response = await apiFetch(`/api/responses/${formId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId ? { "X-Form-Session": sessionId } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Submission failed");
      }

      endVisit(formId);
      setSubmitted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    }
  };

  if (loading) {
    return (
      <div className="page-bg flex items-center justify-center">
        <p className="text-slate-500">Loading form...</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="page-bg flex items-center justify-center px-6">
        <div className="card-elevated w-full max-w-md overflow-hidden p-0 text-center">
          <div className="h-2.5 bg-gradient-to-r from-indigo-500 to-indigo-700" />
          <div className="p-8">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-2xl">
              ✓
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
              Thank you!
            </h2>
            <p className="mt-2 whitespace-pre-line text-slate-600">
              {form?.thankYouMessage || "Your submission has been received."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!form || status) {
    return (
      <div className="page-bg flex items-center justify-center px-6">
        <div className="status-error w-full max-w-md text-center">
          {status || "Form not found"}
        </div>
      </div>
    );
  }

  const visibleFields = form.schema.filter((field) => isFieldVisible(field, formData));

  return (
    <div className="page-bg px-6 py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="card-elevated overflow-hidden p-0">
          <div className="h-2.5 bg-gradient-to-r from-indigo-500 to-indigo-700" />
          <div className="p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{form.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Powered by Forma</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {visibleFields.map((field) => (
              <div
                key={field.id}
                // Focus covers typing and tabbing; change covers inputs that can
                // be set without taking focus. Each field is reported once.
                onFocusCapture={() => reportFieldReached(field.id)}
                onChangeCapture={() => reportFieldReached(field.id)}
              >
                <label className="label mb-2 block">
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                {field.type === "text" ? (
                  <input
                    required={field.required}
                    className="input"
                    placeholder="Type here..."
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                ) : null}
                {field.type === "textarea" ? (
                  <textarea
                    required={field.required}
                    className="input min-h-28"
                    placeholder="Type here..."
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                ) : null}
                {field.type === "email" ? (
                  <input
                    type="email"
                    required={field.required}
                    className="input"
                    placeholder="name@example.com"
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                ) : null}
                {field.type === "number" ? (
                  <input
                    type="number"
                    required={field.required}
                    className="input"
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                ) : null}
                {field.type === "date" ? (
                  <input
                    type="date"
                    required={field.required}
                    className="input"
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  />
                ) : null}
                {field.type === "checkbox" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      required={field.required}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={formData[field.id] === "true"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [field.id]: e.target.checked ? "true" : "false",
                        }))
                      }
                    />
                    <span className="text-sm text-slate-600">Yes</span>
                  </div>
                ) : null}
                {field.type === "select" ? (
                  <select
                    required={field.required}
                    className="input"
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                  >
                    <option value="">Select an option</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : null}
                {field.type === "file" ? (
                  <input
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    required={field.required}
                    className="input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFiles((prev) => ({ ...prev, [field.id]: file }));
                        setFormData((prev) => ({ ...prev, [field.id]: file.name }));
                      }
                    }}
                  />
                ) : null}
              </div>
            ))}

            {status ? <div className="status-error">{status}</div> : null}

            <button
              type="submit"
              className="btn-primary w-full"
            >
              Submit
            </button>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}
