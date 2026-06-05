import { Resend } from "resend";

const LOG_PREFIX = "[signup][resend]";

interface WelcomeInput {
  toEmail: string;
  customerName: string;
  licenseKey: string;
  licenseExpiry: string | null;
  invitationUrl: string;
  quickstartUrl: string;
}

interface SupportNotifyInput {
  customerName: string;
  customerEmail: string;
  company: string;
  githubUsername: string;
  licenseId: string;
  licenseKey: string;
}

export async function sendWelcomeEmail(
  input: WelcomeInput,
  dryRun: boolean,
): Promise<void> {
  const from = required("RESEND_FROM");

  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would send welcome to ${input.toEmail}`);
    return;
  }

  const apiKey = required("RESEND_API_KEY");
  const resend = new Resend(apiKey);

  const expiryLine = input.licenseExpiry
    ? `Your trial is active until <strong>${new Date(input.licenseExpiry).toLocaleDateString("en-GB")}</strong>.`
    : `Your trial is now active.`;

  const html = `
    <h1>Welcome to cc-testframework</h1>
    <p>Hi ${escape(input.customerName)},</p>
    <p>your 14-day trial is ready. ${expiryLine}</p>
    <h2>1. Accept your GitHub invite</h2>
    <p>You have been added to the <code>meinTest/cc-testframework</code> repository.
       Open the invitation here:<br>
       <a href="${input.invitationUrl}">${input.invitationUrl}</a></p>
    <h2>2. Configure your license key</h2>
    <p>Set the following environment variable on the machine that runs the tests:</p>
    <pre>CC_LICENSE_KEY=${escape(input.licenseKey)}</pre>
    <h2>3. Read the quickstart</h2>
    <p><a href="${input.quickstartUrl}">${input.quickstartUrl}</a></p>
    <hr>
    <p>Questions? Reply to this email or reach us at
       <a href="mailto:support@itsbusiness.ch">support@itsbusiness.ch</a>.</p>
  `;

  const text = [
    `Welcome to cc-testframework`,
    ``,
    `Hi ${input.customerName},`,
    ``,
    `your 14-day trial is ready. ${expiryLine.replace(/<[^>]+>/g, "")}`,
    ``,
    `1. Accept your GitHub invite: ${input.invitationUrl}`,
    `2. Configure your license: CC_LICENSE_KEY=${input.licenseKey}`,
    `3. Read the quickstart: ${input.quickstartUrl}`,
    ``,
    `Questions? support@itsbusiness.ch`,
  ].join("\n");

  const result = await resend.emails.send({
    from,
    to: input.toEmail,
    subject: "Your cc-testframework trial is ready",
    html,
    text,
  });

  if (result.error) {
    throw new Error(`Resend welcome send failed: ${result.error.message}`);
  }
  console.log(`${LOG_PREFIX} welcome sent to ${input.toEmail} (id=${result.data?.id})`);
}

export async function notifySupport(
  input: SupportNotifyInput,
  dryRun: boolean,
): Promise<void> {
  const from = required("RESEND_FROM");
  const to = required("RESEND_SUPPORT_TO");

  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would notify ${to} about ${input.customerEmail}`);
    return;
  }

  const apiKey = required("RESEND_API_KEY");
  const resend = new Resend(apiKey);

  const text = [
    `New trial activated:`,
    ``,
    `Name:           ${input.customerName}`,
    `Email:          ${input.customerEmail}`,
    `Company:        ${input.company}`,
    `GitHub:         ${input.githubUsername}`,
    `License ID:     ${input.licenseId}`,
    `License Key:    ${input.licenseKey}`,
    ``,
    `Sales follow-up suggested after ~10 days of trial.`,
  ].join("\n");

  const result = await resend.emails.send({
    from,
    to,
    subject: `[cc-testframework] New trial: ${input.company}`,
    text,
  });

  if (result.error) {
    console.error(`${LOG_PREFIX} support notify failed: ${result.error.message}`);
    return;
  }
  console.log(`${LOG_PREFIX} support notified (id=${result.data?.id})`);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function escape(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
