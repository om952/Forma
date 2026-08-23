"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppHeader from "../../components/AppHeader";
import FormSubNav from "../../components/FormSubNav";
import { apiFetch, getApiBaseUrl } from "../../lib/api";
import { getAuthToken } from "../../lib/auth";

const FIELD_ICONS: Record<string, string> = {
  text: "✏️",
  textarea: "📝",
  email: "✉️",
  number: "#️⃣",
  date: "📅",
  checkbox: "☑️",
  select: "▾",
  file: "📎",
};
import {
  useFormBuilderStore,
  type FormField,
  type FormRule,
  type RuleOperator,
  type RuleAction,
} from "../../stores/formBuilderStore";

export default function FormBuilderPage() {
  const {
    title,
    thankYouMessage,
    schema,
    rules,
    setTitle,
    setThankYouMessage,
    addField,
    clear,
    updateField,
    removeField,
    reorderFields,
    addRule,
    updateRule,
    removeRule,
    loadForm,
  } = useFormBuilderStore();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [ruleIfFieldId, setRuleIfFieldId] = useState("");
  const [ruleOperator, setRuleOperator] = useState<RuleOperator>("equals");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleAction, setRuleAction] = useState<RuleAction>("show");
  const [ruleTargetFieldId, setRuleTargetFieldId] = useState("");
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    setToken(getAuthToken());
    // Read the edit target straight off the URL rather than via useSearchParams,
    // which would require wrapping this page in a Suspense boundary.
    const editingId = new URLSearchParams(window.location.search).get("formId");
    setFormId(editingId);
  }, []);

  // Hydrate the builder when editing an existing form.
  useEffect(() => {
    if (!formId || !token) return;

    const loadExisting = async () => {
      setIsLoading(true);
      setStatus(null);
      try {
        const response = await apiFetch(`/api/forms/${formId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load form");
        }
        const data = (await response.json()) as {
          name: string;
          schema: FormField[];
          thankYouMessage?: string | null;
        };
        loadForm({
          title: data.name,
          thankYouMessage: data.thankYouMessage ?? "",
          schema: data.schema ?? [],
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    loadExisting();
  }, [formId, token, loadForm]);

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);

    try {
      if (!token) {
        setStatus("Please sign in before saving a form.");
        return;
      }

      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setStatus("Give your form a title before saving.");
        return;
      }

      const schemaWithRules = schema.map((field) => ({
        ...field,
        rules: rules.filter((rule) => rule.targetFieldId === field.id),
      }));

      const isEditing = Boolean(formId);
      const response = await apiFetch(
        isEditing ? `/api/forms/${formId}` : "/api/forms",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: trimmedTitle,
            schema: schemaWithRules,
            thankYouMessage,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || "Failed to save form");
      }

      // A newly created form becomes the edit target, so a second save updates
      // it instead of creating a duplicate.
      if (!isEditing) {
        const created = (await response.json()) as { id?: string };
        if (created?.id) setFormId(created.id);
      }

      setStatus(isEditing ? "Form updated successfully." : "Form saved successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditField = (field: FormField) => {
    setEditingField(field.id);
    setFieldLabel(field.label);
    setFieldRequired(field.required);
    setFieldOptions(field.options?.join(", ") ?? "");
  };

  const editingFieldType = schema.find((f) => f.id === editingField)?.type;

  const handleUpdateField = () => {
    if (!editingField) return;
    updateField(editingField, {
      label: fieldLabel,
      required: fieldRequired,
      // Only selects carry options — don't stamp an empty array onto other types.
      ...(editingFieldType === "select"
        ? {
            options: fieldOptions
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    });
    setEditingField(null);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    reorderFields(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleAddRule = () => {
    if (!ruleIfFieldId || !ruleTargetFieldId || ruleIfFieldId === ruleTargetFieldId) {
      setStatus("Invalid rule: source and target fields must be different");
      return;
    }

    addRule({
      ifFieldId: ruleIfFieldId,
      operator: ruleOperator,
      value: ruleValue,
      action: ruleAction,
      targetFieldId: ruleTargetFieldId,
    });

    setRuleIfFieldId("");
    setRuleValue("");
    setRuleTargetFieldId("");
    setStatus(null);
  };

  const handleEditRule = (rule: FormRule) => {
    setEditingRule(rule.id);
    setRuleIfFieldId(rule.ifFieldId);
    setRuleOperator(rule.operator);
    setRuleValue(rule.value);
    setRuleAction(rule.action);
    setRuleTargetFieldId(rule.targetFieldId);
  };

  const handleUpdateRule = () => {
    if (!editingRule) return;
    if (!ruleIfFieldId || !ruleTargetFieldId || ruleIfFieldId === ruleTargetFieldId) {
      setStatus("Invalid rule: source and target fields must be different");
      return;
    }
    updateRule(editingRule, {
      ifFieldId: ruleIfFieldId,
      operator: ruleOperator,
      value: ruleValue,
      action: ruleAction,
      targetFieldId: ruleTargetFieldId,
    });
    setEditingRule(null);
    setRuleIfFieldId("");
    setRuleValue("");
    setRuleTargetFieldId("");
    setStatus(null);
  };

  return (
    <div className="page-bg">
      <AppHeader />
      {formId ? (
        <FormSubNav formId={formId} active="builder" formName={title || undefined} />
      ) : null}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside className="w-full lg:w-72">
          <div className="card-elevated sticky top-24">
            <div className="space-y-2">
              <p className="eyebrow">{formId ? "Editing" : "Toolbox"}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Forma Builder</h1>
              <p className="text-sm leading-relaxed text-slate-600">
                Add fields, drag to reorder, and set conditional show/hide rules.
              </p>
            </div>

            <div className="mt-6">
              <label className="label">Form title</label>
              <input
                className="input mt-2"
                placeholder="Customer feedback"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button className="btn-secondary text-left" onClick={() => addField("text")}>
                {FIELD_ICONS.text} Text
              </button>
              <button className="btn-secondary text-left" onClick={() => addField("textarea")}>
                {FIELD_ICONS.textarea} Long answer
              </button>
              <button className="btn-secondary text-left" onClick={() => addField("email")}>
                {FIELD_ICONS.email} Email
              </button>
              <button className="btn-secondary text-left" onClick={() => addField("number")}>
                {FIELD_ICONS.number} Number
              </button>
              <button className="btn-secondary text-left" onClick={() => addField("date")}>
                {FIELD_ICONS.date} Date
              </button>
              <button className="btn-secondary text-left" onClick={() => addField("checkbox")}>
                {FIELD_ICONS.checkbox} Checkbox
              </button>
              <button className="btn-secondary text-left" onClick={() => addField("select")}>
                {FIELD_ICONS.select} Select
              </button>
              <button className="btn-secondary text-left" onClick={() => addField("file")}>
                {FIELD_ICONS.file} File
              </button>
            </div>

            <button
              className="btn-secondary mt-2.5 w-full text-left"
              onClick={() => setShowRules((s) => !s)}
            >
              {showRules ? "Hide Rules" : "Conditional Rules"}
            </button>

            <div className="mt-6">
              <label className="label">Thank-you message</label>
              <textarea
                className="input mt-2 min-h-20"
                placeholder="Thanks! We'll be in touch shortly."
                value={thankYouMessage}
                onChange={(e) => setThankYouMessage(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Shown after someone submits. Leave blank for the default.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              <button
                className="btn-primary w-full"
                onClick={handleSave}
                disabled={isSaving || isLoading}
              >
                {isSaving
                  ? "Saving..."
                  : isLoading
                    ? "Loading..."
                    : formId
                      ? "Update Form"
                      : "Save Form"}
              </button>
              <button
                className="btn-secondary w-full"
                onClick={() => {
                  clear();
                  setFormId(null);
                }}
              >
                {formId ? "New Form" : "Clear All"}
              </button>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                API: {apiBase}
              </div>
              {token ? <p className="text-xs text-slate-500">Authenticated</p> : null}
              {status ? <div className="status-info">{status}</div> : null}
            </div>
          </div>
        </aside>

        <section className="flex-1">
          <div className="card-elevated">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900">Live Preview</h2>
                <p className="text-sm text-slate-600">
                  {schema.length === 0
                    ? "Add a field to start building."
                    : `${schema.length} field${schema.length > 1 ? "s" : ""} added.`}
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Draft
              </span>
            </div>

            <div className="mt-8 space-y-4">
              {schema.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
                  Drag in fields to see them here.
                </div>
              ) : (
                schema.map((field, index) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-move rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition ${
                      draggedIndex === index ? "opacity-50 ring-2 ring-slate-400" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        {field.label}
                        {field.required ? " *" : ""}
                      </label>
                      <span className="text-xs text-slate-400">⋮⋮</span>
                    </div>
                    {field.type === "text" ? (
                      <input className="input" placeholder="Type here..." readOnly />
                    ) : null}
                    {field.type === "textarea" ? (
                      <textarea className="input min-h-20" placeholder="Type here..." readOnly />
                    ) : null}
                    {field.type === "email" ? (
                      <input className="input" type="email" placeholder="name@example.com" readOnly />
                    ) : null}
                    {field.type === "number" ? (
                      <input className="input" type="number" placeholder="0" readOnly />
                    ) : null}
                    {field.type === "date" ? (
                      <input className="input" type="date" readOnly />
                    ) : null}
                    {field.type === "checkbox" ? (
                      <div className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" disabled />
                        <span className="text-sm text-slate-500">Unchecked</span>
                      </div>
                    ) : null}
                    {field.type === "select" ? (
                      <select className="input" disabled>
                        {field.options?.map((opt) => <option key={opt}>{opt}</option>) ?? (
                          <option>Select an option</option>
                        )}
                      </select>
                    ) : null}
                    {field.type === "file" ? (
                      <input className="input" type="file" disabled />
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleEditField(field)}
                        className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeField(field.id)}
                        className="rounded-lg bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {showRules ? (
              <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Conditional Rules</h3>
                <p className="text-sm text-slate-600">
                  Show or hide fields based on another field's value.
                </p>

                <div className="mt-4 space-y-3">
                  {rules.length === 0 ? (
                    <p className="text-sm text-slate-500">No rules configured yet.</p>
                  ) : (
                    rules.map((rule) => {
                      const sourceField = schema.find((f) => f.id === rule.ifFieldId);
                      const targetField = schema.find((f) => f.id === rule.targetFieldId);
                      return (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <span className="text-sm text-slate-700">
                            If <strong>{sourceField?.label ?? rule.ifFieldId}</strong>{" "}
                            {rule.operator.replace("_", " ")}{" "}
                            <strong>{rule.value}</strong>, then{" "}
                            <strong>{rule.action}</strong>{" "}
                            <strong>{targetField?.label ?? rule.targetFieldId}</strong>
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditRule(rule)}
                              className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => removeRule(rule.id)}
                              className="rounded-lg bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      className="input"
                      value={ruleIfFieldId}
                      onChange={(e) => setRuleIfFieldId(e.target.value)}
                    >
                      <option value="">Select source field</option>
                      {schema.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={ruleOperator}
                      onChange={(e) => setRuleOperator(e.target.value as RuleOperator)}
                    >
                      <option value="equals">equals</option>
                      <option value="not_equals">not equals</option>
                      <option value="contains">contains</option>
                      <option value="not_contains">does not contain</option>
                    </select>
                  </div>
                  <input
                    className="input"
                    placeholder="Value to match"
                    value={ruleValue}
                    onChange={(e) => setRuleValue(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      className="input"
                      value={ruleAction}
                      onChange={(e) => setRuleAction(e.target.value as RuleAction)}
                    >
                      <option value="show">show</option>
                      <option value="hide">hide</option>
                    </select>
                    <select
                      className="input"
                      value={ruleTargetFieldId}
                      onChange={(e) => setRuleTargetFieldId(e.target.value)}
                    >
                      <option value="">Select target field</option>
                      {schema.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={editingRule ? handleUpdateRule : handleAddRule}
                    className="btn-primary w-full"
                  >
                    {editingRule ? "Update Rule" : "Add Rule"}
                  </button>
                  {editingRule ? (
                    <button
                      onClick={() => {
                        setEditingRule(null);
                        setRuleIfFieldId("");
                        setRuleValue("");
                        setRuleTargetFieldId("");
                      }}
                      className="btn-secondary w-full"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {editingField ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit Field</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="label">Label</label>
                <input
                  className="input mt-1"
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fieldRequired}
                  onChange={(e) => setFieldRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label className="text-sm text-slate-700">Required</label>
              </div>
              {editingFieldType === "select" ? (
                <div>
                  <label className="label">Options (comma-separated)</label>
                  <input
                    className="input mt-1"
                    value={fieldOptions}
                    onChange={(e) => setFieldOptions(e.target.value)}
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={handleUpdateField} className="btn-primary flex-1">
                Save Changes
              </button>
              <button onClick={() => setEditingField(null)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
