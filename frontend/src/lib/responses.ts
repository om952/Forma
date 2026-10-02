export type SchemaField = { id: string; label: string; type?: string };

export type Answer = { id: string; label: string; type?: string; text: string };

/**
 * A response's answers in the form's own field order. Postgres stores the
 * payload as JSONB, which reorders its keys, so reading them straight off the
 * object scrambles the questions. Answers to fields since removed from the
 * form go last, under their raw ids; questions left blank are kept so a
 * reader can see they were skipped.
 */
export const orderedAnswers = (payload: Record<string, unknown>, schema: SchemaField[] = []): Answer[] => {
  const text = (field: { type?: string }, value: unknown) => {
    const raw = value === undefined || value === null ? "" : String(value);
    if (field.type === "checkbox") return raw === "true" ? "Yes" : "No";
    return raw;
  };

  const known = schema
    .filter((field) => field.id in payload)
    .map((field) => ({ id: field.id, label: field.label, type: field.type, text: text(field, payload[field.id]) }));

  const ids = new Set(schema.map((field) => field.id));
  const removed = Object.keys(payload)
    .filter((id) => !ids.has(id))
    .map((id) => ({ id, label: id, text: text({}, payload[id]) }));

  return [...known, ...removed];
};
