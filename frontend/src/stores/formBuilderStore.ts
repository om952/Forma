import { create } from "zustand";

export type FieldType =
  | "text"
  | "select"
  | "file"
  | "email"
  | "number"
  | "date"
  | "textarea"
  | "checkbox";

export type RuleOperator = "equals" | "not_equals" | "contains" | "not_contains";

export type RuleAction = "show" | "hide";

export type FormRule = {
  id: string;
  ifFieldId: string;
  operator: RuleOperator;
  value: string;
  action: RuleAction;
  targetFieldId: string;
};

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];
  rules?: FormRule[];
};

type FormBuilderState = {
  title: string;
  thankYouMessage: string;
  schema: FormField[];
  rules: FormRule[];
  setTitle: (title: string) => void;
  setThankYouMessage: (message: string) => void;
  addField: (type: FieldType) => void;
  updateField: (id: string, updates: Partial<FormField>) => void;
  removeField: (id: string) => void;
  reorderFields: (fromIndex: number, toIndex: number) => void;
  addRule: (rule: Omit<FormRule, "id">) => void;
  updateRule: (id: string, updates: Partial<FormRule>) => void;
  removeRule: (id: string) => void;
  /** Hydrate the builder from a saved form, splitting rules back off the fields. */
  loadForm: (form: {
    title: string;
    thankYouMessage?: string | null;
    schema: FormField[];
  }) => void;
  clear: () => void;
};

const DEFAULT_LABELS: Record<FieldType, string> = {
  text: "Text field",
  select: "Select field",
  file: "File upload",
  email: "Email address",
  number: "Number",
  date: "Date",
  textarea: "Long answer",
  checkbox: "Checkbox",
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `field_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const useFormBuilderStore = create<FormBuilderState>((set) => ({
  title: "",
  thankYouMessage: "",
  schema: [],
  rules: [],
  setTitle: (title) => set({ title }),
  setThankYouMessage: (thankYouMessage) => set({ thankYouMessage }),
  addField: (type) =>
    set((state) => ({
      schema: [
        ...state.schema,
        {
          id: createId(),
          type,
          label: DEFAULT_LABELS[type],
          required: false,
          options: type === "select" ? ["Option 1", "Option 2"] : undefined,
        },
      ],
    })),
  updateField: (id, updates) =>
    set((state) => ({
      schema: state.schema.map((field) =>
        field.id === id ? { ...field, ...updates } : field
      ),
    })),
  removeField: (id) =>
    set((state) => ({
      schema: state.schema.filter((field) => field.id !== id),
      rules: state.rules.filter(
        (rule) => rule.ifFieldId !== id && rule.targetFieldId !== id
      ),
    })),
  reorderFields: (fromIndex: number, toIndex: number) =>
    set((state) => {
      const newSchema = [...state.schema];
      const [moved] = newSchema.splice(fromIndex, 1);
      newSchema.splice(toIndex, 0, moved);
      return { schema: newSchema };
    }),
  addRule: (rule) =>
    set((state) => ({
      rules: [...state.rules, { ...rule, id: createId() }],
    })),
  updateRule: (id, updates) =>
    set((state) => ({
      rules: state.rules.map((rule) =>
        rule.id === id ? { ...rule, ...updates } : rule
      ),
    })),
  removeRule: (id) =>
    set((state) => ({
      rules: state.rules.filter((rule) => rule.id !== id),
    })),
  loadForm: (form) =>
    set(() => ({
      title: form.title,
      thankYouMessage: form.thankYouMessage ?? "",
      // Saved forms carry their rules nested on the target field; the builder
      // keeps them in a flat list, so split them back apart on load.
      schema: form.schema.map(({ rules: _rules, ...field }) => field),
      rules: form.schema.flatMap((field) => field.rules ?? []),
    })),
  clear: () =>
    set({ title: "", thankYouMessage: "", schema: [], rules: [] }),
}));

export function evaluateRule(
  rule: FormRule,
  fieldValues: Record<string, string>
): boolean {
  const fieldValue = fieldValues[rule.ifFieldId] ?? "";

  switch (rule.operator) {
    case "equals":
      return fieldValue === rule.value;
    case "not_equals":
      return fieldValue !== rule.value;
    case "contains":
      return fieldValue.includes(rule.value);
    case "not_contains":
      return !fieldValue.includes(rule.value);
    default:
      return false;
  }
}

export function isFieldVisible(
  field: FormField,
  fieldValues: Record<string, string>
): boolean {
  if (!field.rules || field.rules.length === 0) return true;

  for (const rule of field.rules) {
    const conditionMet = evaluateRule(rule, fieldValues);
    if (rule.action === "show" && !conditionMet) return false;
    if (rule.action === "hide" && conditionMet) return false;
  }

  return true;
}
