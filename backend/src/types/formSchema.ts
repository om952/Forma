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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isFieldAnswerValid(field: FormField, value: string): boolean {
  const trimmed = (value ?? "").trim();

  // A checkbox only counts as answered when it is actually checked.
  if (field.type === "checkbox") {
    return field.required ? trimmed === "true" : true;
  }

  if (!trimmed) {
    return !field.required;
  }

  // Format checks apply whenever a value is present, required or not.
  if (field.type === "email") {
    return EMAIL_PATTERN.test(trimmed);
  }

  if (field.type === "number") {
    return !Number.isNaN(Number(trimmed));
  }

  return true;
}

export function describeInvalidAnswer(field: FormField, value: string): string {
  const trimmed = (value ?? "").trim();

  if (!trimmed || (field.type === "checkbox" && trimmed !== "true")) {
    return `${field.label} is required`;
  }

  if (field.type === "email") {
    return `${field.label} must be a valid email address`;
  }

  if (field.type === "number") {
    return `${field.label} must be a number`;
  }

  return `${field.label} is invalid`;
}
