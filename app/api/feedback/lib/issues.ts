import { Octokit } from "@octokit/rest";

// GitHub-issues backend for the cc-tmgmt in-app feedback proxy. The GitHub token
// lives only here (server-side); the client never sees it. Customer isolation
// uses a per-license `customer:<licenseId>` label as the index — GET filters
// issues by the validated license's own label, so a client can only ever see
// its own reports (no separate datastore needed).

const LOG_PREFIX = "[feedback]";
// A maintainer comment starting with this sentinel is the ONLY comment content
// ever surfaced to the customer (a deliberately released status reason).
const CUSTOMER_VISIBLE_SENTINEL = ">>CUSTOMER:";

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

export async function createIssue(
  input: CreateIssueInput,
  dryRun: boolean,
): Promise<CreatedIssue> {
  const body = buildIssueBody(input);
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

function buildIssueBody(input: CreateIssueInput): string {
  const ctx = input.context ?? {};
  const lines: string[] = ["## Beschreibung", "", input.description, ""];
  if (input.repro) {
    lines.push("## Reproduktionsschritte", "", input.repro, "");
  }
  lines.push(
    "## Automatisch erfasster Kontext",
    "",
    `- App-Version: ${ctx.version ?? "—"}`,
    `- Platform: ${ctx.platform ?? "—"}`,
    `- OS: ${ctx.osVersion ?? "—"}`,
    `- Ansicht: ${ctx.view ?? "—"}`,
    `- Letzter Fehler: ${ctx.lastError ?? "—"}`,
    `- Kunde: ${input.company || "—"}`,
  );
  return lines.join("\n");
}

function buildLabels(input: CreateIssueInput): string[] {
  const labels = [`type:${input.type}`, customerLabel(input.licenseId)];
  if (input.source === "copilot") labels.push("source:copilot");
  return labels;
}

function customerLabel(licenseId: string): string {
  return `customer:${licenseId}`;
}

interface IssueLike {
  state: string;
  state_reason?: string | null;
  labels: (string | { name?: string })[];
}

function mapStatus(issue: IssueLike): FeedbackStatus {
  const labels = issue.labels
    .map((l) => (typeof l === "string" ? l : l.name))
    .filter((n): n is string => Boolean(n));

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
  return new Octokit({ auth: required("GITHUB_TOKEN") });
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
