import { z } from "zod";

import { idSchema } from "./common";

export const FIELD_TYPES = [
  "text",
  "select",
  "file",
  "email",
  "number",
  "date",
  "textarea",
  "checkbox",
] as const;

export const RULE_OPERATORS = ["equals", "not_equals", "contains", "not_contains"] as const;

export const MAX_FIELDS = 100;
export const MAX_ANSWER_LENGTH = 10_000;

export const formRuleSchema = z.object({
  id: idSchema,
  ifFieldId: idSchema,
  operator: z.enum(RULE_OPERATORS),
  value: z.string().max(500),
  action: z.enum(["show", "hide"]),
  targetFieldId: idSchema,
});

export const formFieldSchema = z.object({
  id: idSchema,
  type: z.enum(FIELD_TYPES),
  label: z.string().trim().min(1, "must not be empty").max(200),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1, "must not be empty").max(200)).max(100).optional(),
  rules: z.array(formRuleSchema).max(20).optional(),
});

/**
 * A form's fields, in display order. Beyond each field's shape, the whole list
 * must hang together: unique ids, options on every select, and rules that sit
 * on their target field and depend on another field of the same form. A
 * broken schema saved here would otherwise surface later as a form nobody can
 * submit, or analytics that cannot be computed.
 */
export const formSchemaSchema = z
  .array(formFieldSchema)
  .max(MAX_FIELDS, `a form can have at most ${MAX_FIELDS} fields`)
  .superRefine((fields, ctx) => {
    const ids = new Set<string>();

    fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        ctx.addIssue({ code: "custom", path: [index, "id"], message: "is used by another field" });
      }
      ids.add(field.id);

      if (field.type === "select" && !field.options?.length) {
        ctx.addIssue({
          code: "custom",
          path: [index, "options"],
          message: "a select field needs at least one option",
        });
      }
    });

    fields.forEach((field, index) => {
      field.rules?.forEach((rule, ruleIndex) => {
        const path = [index, "rules", ruleIndex];

        if (rule.targetFieldId !== field.id) {
          ctx.addIssue({
            code: "custom",
            path: [...path, "targetFieldId"],
            message: "must be the field the rule belongs to",
          });
        }

        if (rule.ifFieldId === field.id) {
          ctx.addIssue({
            code: "custom",
            path: [...path, "ifFieldId"],
            message: "a rule cannot depend on its own field",
          });
        } else if (!ids.has(rule.ifFieldId)) {
          ctx.addIssue({
            code: "custom",
            path: [...path, "ifFieldId"],
            message: "refers to a field that is not in this form",
          });
        }
      });
    });
  });

export type FormFieldInput = z.output<typeof formFieldSchema>;

const titleSchema = z.string().trim().min(1, "must not be empty").max(200);

/** Blank means "use the default message". */
const thankYouSchema = z
  .string()
  .max(2000)
  .nullish()
  .transform((value) => (value && value.trim() ? value.trim() : null));

export const createFormBody = z.object({
  title: titleSchema,
  schema: formSchemaSchema,
  thankYouMessage: thankYouSchema,
});

export const updateFormBody = z
  .object({
    title: titleSchema.optional(),
    schema: formSchemaSchema.optional(),
    isActive: z.boolean().optional(),
    thankYouMessage: thankYouSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "send at least one of title, schema, isActive, thankYouMessage",
  });

/**
 * A respondent's answers, keyed by field id. Every value is a string, as the
 * form page sends them; checkboxes send "true" or "false" and file fields the
 * uploaded file's link.
 */
export const submissionBody = z
  .record(idSchema, z.string().max(MAX_ANSWER_LENGTH, `must be at most ${MAX_ANSWER_LENGTH} characters`))
  .refine((answers) => Object.keys(answers).length <= MAX_FIELDS, {
    message: `at most ${MAX_FIELDS} answers`,
  });
