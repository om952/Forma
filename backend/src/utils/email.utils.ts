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

const button = (url: string, label: string) => `
  <p style="margin-top:24px">
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${escapeHtml(label)}</a>
  </p>
  <p style="font-size:12px;color:#64748b">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>
`;

const ROLE_LABELS: Record<string, string> = {
  OWNER: "an owner",
  ADMIN: "an admin",
  MEMBER: "a member",
};

/** Organization and inviter names are user-supplied, so they are escaped too. */
export function buildInviteEmail(input: {
  orgName: string;
  inviterEmail: string | null;
  role: string;
  url: string;
}): EmailContent {
  const { orgName, inviterEmail, role, url } = input;
  const roleLabel = ROLE_LABELS[role] ?? "a member";
  const who = inviterEmail ?? "Someone";

  const html = shell(`
    <h2 style="margin:0 0 4px;font-size:18px">Join ${escapeHtml(orgName)} on Forma</h2>
    <p style="margin:0;color:#64748b">
      ${escapeHtml(who)} invited you to join <strong>${escapeHtml(orgName)}</strong> as ${roleLabel}.
    </p>
    ${button(url, "Accept invitation")}
    <p style="font-size:12px;color:#94a3b8">The invitation expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
  `);

  return {
    subject: `You're invited to join ${orgName} on Forma`,
    html,
    text: [
      `${who} invited you to join ${orgName} on Forma as ${roleLabel}.`,
      "",
      `Accept the invitation: ${url}`,
      "",
      "The invitation expires in 7 days. If you weren't expecting it, you can ignore this email.",
    ].join("\n"),
  };
}

export function buildPasswordResetEmail(input: {
  orgName: string;
  url: string;
}): EmailContent {
  const { orgName, url } = input;

  const html = shell(`
    <h2 style="margin:0 0 4px;font-size:18px">Reset your password</h2>
    <p style="margin:0;color:#64748b">
      Someone asked to reset the password for your <strong>${escapeHtml(orgName)}</strong> account on Forma.
    </p>
    ${button(url, "Choose a new password")}
    <p style="font-size:12px;color:#94a3b8">The link expires in 1 hour and works once. If you didn't ask for this, ignore this email; your password stays the same.</p>
  `);

  return {
    subject: `Reset your Forma password (${orgName})`,
    html,
    text: [
      `Someone asked to reset the password for your ${orgName} account on Forma.`,
      "",
      `Choose a new password: ${url}`,
      "",
      "The link expires in 1 hour and works once. If you didn't ask for this, ignore this email; your password stays the same.",
    ].join("\n"),
  };
}

export function buildEmailVerificationEmail(input: { url: string }): EmailContent {
  const { url } = input;

  const html = shell(`
    <h2 style="margin:0 0 4px;font-size:18px">Confirm your email address</h2>
    <p style="margin:0;color:#64748b">Confirm this address so Forma can reach you about your account.</p>
    ${button(url, "Confirm email")}
    <p style="font-size:12px;color:#94a3b8">The link expires in 24 hours.</p>
  `);

  return {
    subject: "Confirm your email for Forma",
    html,
    text: [
      "Confirm this address so Forma can reach you about your account.",
      "",
      `Confirm email: ${url}`,
      "",
      "The link expires in 24 hours.",
    ].join("\n"),
  };
}
