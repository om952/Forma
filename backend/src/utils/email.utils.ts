export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Submission values come from anonymous respondents and are interpolated into
 * HTML email bodies, so they must be escaped. `&` is replaced first so the
 * entities produced below are not double-escaped.
 */
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const shell = (body: string) => `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
    ${body}
    <p style="margin-top:32px;font-size:12px;color:#94a3b8">Sent by Forma</p>
  </div>
`;

export function buildOwnerNotificationEmail(input: {
  formName: string;
  fields: Array<{ label: string; value: string }>;
  responsesUrl: string;
}): EmailContent {
  const { formName, fields, responsesUrl } = input;

  const answered = fields.filter((field) => field.value.trim() !== "");

  const rows = answered
    .map(
      (field) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;vertical-align:top;white-space:nowrap">${escapeHtml(field.label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a">${escapeHtml(field.value)}</td>
        </tr>`
    )
    .join("");

  const html = shell(`
    <h2 style="margin:0 0 4px;font-size:18px">New submission</h2>
    <p style="margin:0 0 20px;color:#64748b">on <strong>${escapeHtml(formName)}</strong></p>
    ${
      rows
        ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`
        : `<p style="color:#64748b">The submission had no filled-in fields.</p>`
    }
    <p style="margin-top:24px">
      <a href="${escapeHtml(responsesUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">View all responses</a>
    </p>
  `);

  const text = [
    `New submission on "${formName}"`,
    "",
    ...answered.map((field) => `${field.label}: ${field.value}`),
    "",
    `View all responses: ${responsesUrl}`,
  ].join("\n");

  return {
    subject: `New submission on "${formName}"`,
    html,
    text,
  };
}

export function buildRespondentConfirmationEmail(input: {
  formName: string;
}): EmailContent {
  const { formName } = input;

  const html = shell(`
    <h2 style="margin:0 0 4px;font-size:18px">Thanks for your submission</h2>
    <p style="margin:0;color:#64748b">
      We've received your response to <strong>${escapeHtml(formName)}</strong>.
    </p>
  `);

  return {
    subject: `We received your submission to "${formName}"`,
    html,
    text: `Thanks! We've received your response to "${formName}".`,
  };
}
