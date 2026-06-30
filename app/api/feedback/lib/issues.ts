import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

// GitHub-issues backend for the cc-tmgmt in-app feedback proxy. Authenticated as
// the GitHub App (same credentials as the release proxy) so no static token is
// needed — installation tokens are minted per call. The client never sees it.
// Customer isolation
// uses a per-license `customer:<licenseId>` label as the index — GET filters
// issues by the validated license's own label, so a client can only ever see
// its own reports (no separate datastore needed).

const LOG_PREFIX = "[feedback]";
// A maintainer comment starting with this sentinel is the ONLY comment content
// ever surfaced to the customer (a deliberately released status reason).
const CUSTOMER_VISIBLE_SENTINEL = ">>CUSTOMER:";
// A report the customer removed from their in-tool list. The GitHub issue stays
// OPEN and otherwise untouched (the team keeps working it); GET just hides it.
const CLIENT_HIDDEN_LABEL = "client-hidden";
// Any of these labels means the report has left the "received" state, so the
// customer may no longer edit or withdraw it. (client-hidden is NOT here — it
// doesn't change the issue's workflow state.)
const NON_RECEIVED_LABELS = [
  "status:reviewing",
  "status:in-progress",
  "status:done",
  "wontfix",
];

export type FeedbackType = "bug" | "feature";
export type FeedbackSource = "user" | "copilot";
export type FeedbackStatus =
  | "received"
  | "reviewing"
  | "in_progress"
  | "done"
  | "rejected";

export interface FeedbackContext {
  version?: string;
  platform?: string;
  osVersion?: string;
  view?: string;
  lastError?: string | null;
}

export interface CreateIssueInput {
  type: FeedbackType;
  title: string;
  description: string;
  repro?: string;
  source: FeedbackSource;
  context: FeedbackContext;
  // Server-derived from the license — never from the client.
  company: string;
  licenseId: string;
}

export interface CreatedIssue {
  issueNumber: number;
  issueId: number;
  createdAt: string;
}

export interface FeedbackReport {
  issueNumber: number;
  status: FeedbackStatus;
  statusReason: string | null;
  updatedAt: string;
}

export interface UpdateIssueInput {
  type: FeedbackType;
  title: string;
  description: string;
  repro?: string;
  // Server-derived from the license.
  company: string;
}

// A report that has passed the ownership + "received" guard and may be edited.
export interface EditableIssue {
  number: number;
  state: string;
  body: string;
  labels: string[];
  updatedAt: string;
}

export type EditGuard =
  | { ok: true; issue: EditableIssue }
  | { ok: false; status: number; reason: string };

export async function createIssue(
  input: CreateIssueInput,
  dryRun: boolean,
): Promise<CreatedIssue> {
  const contextBlock = buildContextBlock(input.context, input.company);
  const body = buildBody(input.description, input.repro, contextBlock);
  const labels = buildLabels(input);

  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would create ${input.type} issue "${input.title}" labels=[${labels.join(", ")}]`,
    );
    return { issueNumber: 0, issueId: 0, createdAt: new Date().toISOString() };
  }

  const { owner, repo } = repoCoords();
  const res = await octokit().rest.issues.create({
    owner,
    repo,
    title: input.title,
    body,
    labels,
  });
  console.log(`${LOG_PREFIX} created issue #${res.data.number} for ${input.licenseId}`);
  return {
    issueNumber: res.data.number,
    issueId: res.data.id,
    createdAt: res.data.created_at,
  };
}

export async function listCustomerIssues(
  licenseId: string,
  dryRun: boolean,
): Promise<FeedbackReport[]> {
  if (dryRun) {
    return [
      {
        issueNumber: 123,
        status: "in_progress",
        statusReason: null,
        updatedAt: new Date().toISOString(),
      },
      {
        issueNumber: 120,
        status: "rejected",
        statusReason: "Außerhalb des Scopes.",
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  const { owner, repo } = repoCoords();
  const client = octokit();
  const res = await client.rest.issues.listForRepo({
    owner,
    repo,
    labels: customerLabel(licenseId),
    state: "all",
    per_page: 100,
  });

  const reports: FeedbackReport[] = [];
  for (const issue of res.data) {
    if (issue.pull_request) continue; // listForRepo also returns PRs
    if (labelNames(issue).includes(CLIENT_HIDDEN_LABEL)) continue; // removed from tool list
    const status = mapStatus(issue);
    // A released reason is only relevant once an issue is closed.
    const statusReason =
      issue.state === "closed"
        ? await releasedReason(client, owner, repo, issue.number)
        : null;
    reports.push({
      issueNumber: issue.number,
      status,
      statusReason,
      updatedAt: issue.updated_at,
    });
  }
  return reports;
}

const CONTEXT_HEADING = "## Automatisch erfasster Kontext";

function buildContextBlock(ctx: FeedbackContext, company: string): string {
  const c = ctx ?? {};
  return [
    CONTEXT_HEADING,
    "",
    `- App-Version: ${c.version ?? "—"}`,
    `- Platform: ${c.platform ?? "—"}`,
    `- OS: ${c.osVersion ?? "—"}`,
    `- Ansicht: ${c.view ?? "—"}`,
    `- Letzter Fehler: ${c.lastError ?? "—"}`,
    `- Kunde: ${company || "—"}`,
  ].join("\n");
}

function buildBody(
  description: string,
  repro: string | undefined,
  contextBlock: string,
): string {
  const lines: string[] = ["## Beschreibung", "", description, ""];
  if (repro) lines.push("## Reproduktionsschritte", "", repro, "");
  lines.push(contextBlock);
  return lines.join("\n");
}

// On edit the client never resends telemetry, so preserve the original context
// section from the existing issue body.
function extractContextBlock(body: string): string | null {
  const i = body.indexOf(CONTEXT_HEADING);
  return i >= 0 ? body.slice(i).trimEnd() : null;
}

/**
 * Fetch an issue and enforce that it belongs to this license and is still in the
 * `received` state — the only state in which a customer may edit or withdraw it.
 * Client-side visibility is not security: the server enforces ownership + state.
 */
export async function loadEditableIssue(
  licenseId: string,
  issueNumber: number,
  dryRun: boolean,
): Promise<EditGuard> {
  if (dryRun) {
    return {
      ok: true,
      issue: {
        number: issueNumber,
        state: "open",
        body: `## Beschreibung\n\nDry run\n\n${CONTEXT_HEADING}\n\n- App-Version: 0.6.2\n- Kunde: DryRun Co`,
        labels: [customerLabel(licenseId), "type:bug"],
        updatedAt: new Date().toISOString(),
      },
    };
  }

  const { owner, repo } = repoCoords();
  let data;
  try {
    const res = await octokit().rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    data = res.data;
  } catch (err) {
    if (isNotFound(err)) return { ok: false, status: 404, reason: "Report not found" };
    throw err;
  }

  if (data.pull_request) return { ok: false, status: 404, reason: "Report not found" };

  const labels = labelNames(data);
  if (!labels.includes(customerLabel(licenseId))) {
    return { ok: false, status: 403, reason: "Not your report" };
  }
  if (!isReceived(data.state, labels)) {
    return {
      ok: false,
      status: 409,
      reason: "Report can no longer be edited or withdrawn",
    };
  }

  return {
    ok: true,
    issue: {
      number: data.number,
      state: data.state,
      body: data.body ?? "",
      labels,
      updatedAt: data.updated_at,
    },
  };
}

export async function updateIssue(
  issue: EditableIssue,
  input: UpdateIssueInput,
  dryRun: boolean,
): Promise<{ updatedAt: string }> {
  const contextBlock =
    extractContextBlock(issue.body) ?? buildContextBlock({}, input.company);
  const body = buildBody(input.description, input.repro, contextBlock);
  // Swap the type:* label, keep customer/company/source and anything else.
  const labels = issue.labels
    .filter((l) => !l.startsWith("type:"))
    .concat(`type:${input.type}`);

  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would update issue #${issue.number}`);
    return { updatedAt: new Date().toISOString() };
  }

  const { owner, repo } = repoCoords();
  const res = await octokit().rest.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    title: input.title,
    body,
    labels,
  });
  return { updatedAt: res.data.updated_at };
}

export async function withdrawIssue(
  issue: EditableIssue,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would hide issue #${issue.number} from the tool list`,
    );
    return;
  }
  // Remove it from the customer's in-tool list ONLY: add an internal marker
  // label and leave the GitHub issue OPEN and otherwise untouched, so the team
  // keeps working it normally. No close, no delete. GET filters these out.
  const { owner, repo } = repoCoords();
  await octokit().rest.issues.addLabels({
    owner,
    repo,
    issue_number: issue.number,
    labels: [CLIENT_HIDDEN_LABEL],
  });
}

function buildLabels(input: CreateIssueInput): string[] {
  // customer:<licenseId> is the unique, stable isolation index used by GET.
  // company:<name> is added purely so humans can see the customer in the issue
  // list (private repo). GET never filters by the company label, so a comma or
  // a duplicate company name in it is harmless.
  const labels = [`type:${input.type}`, customerLabel(input.licenseId)];
  if (input.company) labels.push(`company:${companyLabel(input.company)}`);
  if (input.source === "copilot") labels.push("source:copilot");
  return labels;
}

function customerLabel(licenseId: string): string {
  return `customer:${licenseId}`;
}

function companyLabel(name: string): string {
  // GitHub label names cap at 50 chars; "company:" already uses 8.
  return name.trim().slice(0, 40);
}

interface IssueLike {
  state: string;
  state_reason?: string | null;
  labels: (string | { name?: string })[];
}

function labelNames(issue: {
  labels: (string | { name?: string })[];
}): string[] {
  return issue.labels
    .map((l) => (typeof l === "string" ? l : l.name))
    .filter((n): n is string => Boolean(n));
}

function isReceived(state: string, labels: string[]): boolean {
  return state === "open" && !labels.some((l) => NON_RECEIVED_LABELS.includes(l));
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 404
  );
}

function mapStatus(issue: IssueLike): FeedbackStatus {
  const labels = labelNames(issue);

  if (issue.state === "open") {
    if (labels.includes("status:in-progress")) return "in_progress";
    if (labels.includes("status:reviewing")) return "reviewing";
    return "received";
  }
  // closed
  if (issue.state_reason === "not_planned" || labels.includes("wontfix")) {
    return "rejected";
  }
  return "done";
}

async function releasedReason(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<string | null> {
  const res = await client.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const marked = res.data
    .map((c) => c.body ?? "")
    .filter((b) => b.trimStart().startsWith(CUSTOMER_VISIBLE_SENTINEL));
  if (marked.length === 0) return null;
  const last = marked[marked.length - 1];
  return last.trimStart().slice(CUSTOMER_VISIBLE_SENTINEL.length).trim() || null;
}

function octokit(): Octokit {
  const appId = required("GH_APP_ID");
  const installationId = required("GH_APP_INSTALLATION_ID");
  const privateKey = required("GH_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(appId),
      privateKey,
      installationId: Number(installationId),
    },
  });
}

function repoCoords(): { owner: string; repo: string } {
  const [owner, repo] = required("FEEDBACK_REPO").split("/");
  if (!owner || !repo) {
    throw new Error("FEEDBACK_REPO must be in the form owner/repo");
  }
  return { owner, repo };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
