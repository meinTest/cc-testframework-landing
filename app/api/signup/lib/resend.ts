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

interface ReminderInput {
  toEmail: string;
  customerName: string;
  licenseKey: string;
  expiresAt: string;
  salesEmail: string;
}

export async function sendReminderEmail(
  input: ReminderInput,
  dryRun: boolean,
): Promise<void> {
  const from = required("RESEND_FROM");

  if (dryRun) {
    console.log(
      `[cron][resend] DRY_RUN — would send reminder to ${input.toEmail}`,
    );
    return;
  }

  const apiKey = required("RESEND_API_KEY");
  const resend = new Resend(apiKey);

  const expiresOn = new Date(input.expiresAt).toLocaleDateString("en-GB");

  const html = `
    <h1>Your cc-testframework trial ends soon</h1>
    <p>Hi ${escape(input.customerName)},</p>
    <p>your 14-day trial expires on <strong>${expiresOn}</strong>.</p>
    <p>If you would like to continue using cc-testframework beyond the
       trial, please reach out to our sales team at
       <a href="mailto:${input.salesEmail}">${input.salesEmail}</a>.
       We will arrange a paid license that converts your existing
       setup without any reinstall.</p>
    <p>No action is required if you would prefer to let the trial
       expire — tests will continue to run, but you will see expiry
       warnings in the output.</p>
    <hr>
    <p>Your license key (for reference):</p>
    <pre>${escape(input.licenseKey)}</pre>
  `;

  const text = [
    `Your cc-testframework trial ends soon`,
    ``,
    `Hi ${input.customerName},`,
    ``,
    `your 14-day trial expires on ${expiresOn}.`,
    ``,
    `If you would like to continue using cc-testframework beyond the trial,`,
    `please reach out to ${input.salesEmail}. We will arrange a paid license`,
    `that converts your existing setup without any reinstall.`,
    ``,
    `No action is required if you would prefer to let the trial expire.`,
    ``,
    `Your license key (for reference): ${input.licenseKey}`,
  ].join("\n");

  const result = await resend.emails.send({
    from,
    to: input.toEmail,
    subject: "Your cc-testframework trial ends in 2 days",
    html,
    text,
  });

  if (result.error) {
    throw new Error(`Resend reminder send failed: ${result.error.message}`);
  }
  console.log(
    `[cron][resend] reminder sent to ${input.toEmail} (id=${result.data?.id})`,
  );
}

interface DemoRequestInput {
  customerName: string;
  customerEmail: string;
  company: string;
  useCase: string;
  salesActionUrl: string;
}

export async function notifyDemoRequest(
  input: DemoRequestInput,
  dryRun: boolean,
): Promise<void> {
  const from = required("RESEND_FROM");
  const to = required("SALES_NOTIFY_EMAIL");

  if (dryRun) {
    console.log(
      `[demo-request][resend] DRY_RUN — would notify ${to} about ${input.customerEmail} (action=${input.salesActionUrl})`,
    );
    return;
  }

  const apiKey = required("RESEND_API_KEY");
  const resend = new Resend(apiKey);

  const html = `
    <p>New demo request received. After vetting, send the signup link with one click:</p>
    <p><a href="${input.salesActionUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">Approve and issue signup link</a></p>
    <p style="color:#64748b;font-size:13px">The button opens a confirm page (no login required, signed link, valid 24 hours). One more click there will issue the trial token and email the personalized signup URL to the customer.</p>
    <hr>
    <table style="border-collapse:collapse">
      <tr><td style="padding:4px 12px 4px 0"><strong>Name</strong></td><td>${escape(input.customerName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td>${escape(input.customerEmail)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Company</strong></td><td>${escape(input.company)}</td></tr>
    </table>
    <p><strong>Use case</strong></p>
    <pre style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:6px;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escape(input.useCase)}</pre>
  `;

  const text = [
    `New demo request received.`,
    ``,
    `Approve and issue the signup link in one click:`,
    input.salesActionUrl,
    ``,
    `Name:     ${input.customerName}`,
    `Email:    ${input.customerEmail}`,
    `Company:  ${input.company}`,
    ``,
    `Use case:`,
    input.useCase,
  ].join("\n");

  const result = await resend.emails.send({
    from,
    to,
    subject: `[cc-testframework] Demo request: ${input.company}`,
    html,
    text,
    replyTo: input.customerEmail,
  });

  if (result.error) {
    throw new Error(
      `Resend demo-request notify failed: ${result.error.message}`,
    );
  }
  console.log(
    `[demo-request][resend] sales notified about ${input.customerEmail} (id=${result.data?.id})`,
  );
}

interface OnboardInviteInput {
  customerName: string;
  toEmail: string;
  onboardUrl: string;
  expiresAt: string;
}

export async function sendOnboardInvite(
  input: OnboardInviteInput,
  dryRun: boolean,
): Promise<void> {
  const from = required("RESEND_FROM");

  if (dryRun) {
    console.log(
      `[sales][resend] DRY_RUN — would send onboard invite to ${input.toEmail}`,
    );
    return;
  }

  const apiKey = required("RESEND_API_KEY");
  const resend = new Resend(apiKey);

  const expiresOn = new Date(input.expiresAt).toLocaleDateString("en-GB");

  const html = `
    <h1>Your cc-testframework trial is ready to activate</h1>
    <p>Hi ${escape(input.customerName)},</p>
    <p>thank you for your interest. Please complete your trial signup
       using the personalized link below:</p>
    <p><a href="${input.onboardUrl}">${input.onboardUrl}</a></p>
    <p>This link is valid until <strong>${expiresOn}</strong> and can
       only be used once.</p>
    <hr>
    <p>Questions? Reply to this email or reach us at
       <a href="mailto:support@itsbusiness.ch">support@itsbusiness.ch</a>.</p>
  `;

  const text = [
    `Your cc-testframework trial is ready to activate`,
    ``,
    `Hi ${input.customerName},`,
    ``,
    `thank you for your interest. Please complete your trial signup`,
    `using the personalized link below:`,
    ``,
    input.onboardUrl,
    ``,
    `This link is valid until ${expiresOn} and can only be used once.`,
    ``,
    `Questions? support@itsbusiness.ch`,
  ].join("\n");

  const result = await resend.emails.send({
    from,
    to: input.toEmail,
    subject: "Your cc-testframework trial — complete your signup",
    html,
    text,
  });

  if (result.error) {
    throw new Error(`Resend onboard invite failed: ${result.error.message}`);
  }
  console.log(
    `[sales][resend] onboard invite sent to ${input.toEmail} (id=${result.data?.id})`,
  );
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
