export type WebhookPayloadType = "generic" | "slack" | "zapier";

export function detectPayloadType(url: string): WebhookPayloadType {
  const lower = url.toLowerCase();
  if (lower.includes("hooks.slack.com") || lower.includes("slack.com")) {
    return "slack";
  }
  if (lower.includes("hooks.zapier.com") || lower.includes("zapier.com")) {
    return "zapier";
  }
  return "generic";
}

export function buildSlackPayload(
  payload: Record<string, string>,
  formName: string
) {
  const fields = Object.entries(payload).map(([key, value]) => ({
    title: key,
    value: String(value).slice(0, 1000),
    short: false,
  }));

  return {
    text: `New submission on "${formName}"`,
    attachments: [
      {
        color: "#0f172a",
        fields,
        footer: "Forma",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

export function buildZapierPayload(
  payload: Record<string, string>,
  formId: string,
  responseId: string
) {
  return {
    event: "form_submission",
    formId,
    responseId,
    submittedAt: new Date().toISOString(),
    data: payload,
  };
}

/**
 * BullMQ emits `failed` on every attempt, so the worker needs to distinguish an
 * intermediate retry from a terminal failure. On the final attempt `attemptsMade`
 * has reached the configured ceiling; before that it is strictly lower.
 */
export function isRetriesExhausted(
  attemptsMade: number,
  maxAttempts: number | undefined
): boolean {
  return attemptsMade >= (maxAttempts ?? 1);
}
