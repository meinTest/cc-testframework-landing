import { randomUUID } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { octokit, repoCoords } from "./issues";

// Server-side handling for user-attached feedback screenshots. The client sends
// them inline as PNG/JPEG/WebP data-URLs in the POST payload; GitHub renders no
// `data:` URIs and the client holds no GitHub token, so the proxy must upload
// each image with its server-side App token and hand back a github.com blob-view
// URL that issues.ts links from the issue body.
//
// The link uses the github.com/<owner>/<repo>/blob/<branch>/<path> domain, NOT
// raw.githubusercontent.com: for a PRIVATE repo the raw domain 404s even for
// logged-in collaborators (it doesn't share the github.com session cookie),
// whereas the blob view authenticates the session and opens for repo members
// (outsiders still get 404 — confidentiality preserved). See Issue #5.
//
// Assets are committed to a dedicated ORPHAN branch (no shared history with main),
// so screenshot commits never touch main history or trigger its CI. Everything
// degrades gracefully: invalid/oversized/non-image entries are dropped and an
// upload failure (e.g. the App lacking Contents:write) skips that image — the
// feedback report is still filed, just without the affected screenshot.

const LOG_PREFIX = "[feedback][screenshots]";

// Client already caps at 6 images / ≤6 MB each; re-enforce server-side since
// client limits are not security. ~8 MB decoded leaves headroom over the client cap.
const MAX_IMAGES = 6;
const MAX_DECODED_BYTES = 8 * 1024 * 1024;

// Only these three image types, base64-encoded, are accepted.
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/;

// Dedicated orphan branch that only ever holds screenshots. Never merged into
// main, so image commits can't pollute main history or trigger its CI.
const DEFAULT_BRANCH = "feedback-assets";

export type ImageExt = "png" | "jpg" | "webp";

export interface ParsedImage {
  buffer: Buffer;
  ext: ImageExt;
}

// Verify real image magic bytes and return the true type — authoritative over
// the declared data-URL MIME. Unknown/mismatched content returns null (dropped),
// so the store can only ever receive genuine PNG/JPEG/WebP bytes.
function sniffImage(buf: Buffer): ImageExt | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // "RIFF"
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Parse the raw `images` field into validated image buffers. Non-strings, wrong
 * MIME types, undecodable base64, empty/oversized entries and anything whose
 * bytes are not a genuine PNG/JPEG/WebP are all silently dropped; at most
 * MAX_IMAGES are returned. Never throws.
 */
export function parseImages(raw: unknown): ParsedImage[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedImage[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_IMAGES) break;
    if (typeof entry !== "string") continue;
    const match = DATA_URL_RE.exec(entry.trim());
    if (!match) continue;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    } catch {
      continue;
    }
    if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) continue;
    // Magic-byte check: the bytes must actually be an image, not just carry a
    // matching data-URL prefix. The sniffed type wins over the declared MIME.
    const ext = sniffImage(buffer);
    if (!ext) continue;
    out.push({ buffer, ext });
  }
  return out;
}

/**
 * Upload each image to the feedback repo's orphan assets branch and return its
 * github.com blob-view URL, in order. Individual upload failures are logged and
 * skipped (that image is omitted); the batch never throws for a single failure.
 */
export async function uploadImages(
  images: ParsedImage[],
  dryRun: boolean,
): Promise<string[]> {
  if (images.length === 0) return [];

  // Group all of a report's screenshots under one unguessable folder.
  const folder = randomUUID();
  const branch = process.env.FEEDBACK_ASSETS_BRANCH || DEFAULT_BRANCH;

  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would upload ${images.length} image(s) to ${branch}:${folder}/`);
    return images.map(
      (img, i) => `https://github.com/DRYRUN/DRYRUN/blob/${branch}/${folder}/${i + 1}.${img.ext}`,
    );
  }

  const { owner, repo } = repoCoords();
  const client = octokit();
  await ensureOrphanBranch(client, owner, repo, branch);

  const urls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const path = `${folder}/${i + 1}.${img.ext}`;
    try {
      await client.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        branch,
        message: `chore(feedback): screenshot ${i + 1} (${folder})`,
        content: img.buffer.toString("base64"),
      });
      urls.push(`https://github.com/${owner}/${repo}/blob/${branch}/${path}`);
    } catch (err) {
      // Most likely cause: the GitHub App lacks Contents:write on the repo.
      console.error(`${LOG_PREFIX} upload failed for ${path} — skipping`, err);
    }
  }

  console.log(`${LOG_PREFIX} uploaded ${urls.length}/${images.length} image(s) to ${branch}:${folder}/`);
  return urls;
}

// Once-per-instance memo — the branch only needs creating the very first time.
let branchReady: string | null = null;

// Ensure the assets branch exists as an ORPHAN branch (a root commit with no
// parents → no shared history with main, nothing from main present). Creating it
// this way guarantees screenshots live entirely off to the side.
async function ensureOrphanBranch(
  client: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  if (branchReady === branch) return;

  try {
    await client.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    branchReady = branch;
    return;
  } catch (err) {
    if (!isStatus(err, 404)) throw err;
  }

  const readme = [
    `# ${branch}`,
    "",
    "Auto-managed orphan branch holding user-attached feedback screenshots",
    "(committed by the feedback proxy). It has no shared history with main and",
    "must never be merged into it.",
    "",
  ].join("\n");

  try {
    const blob = await client.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(readme).toString("base64"),
      encoding: "base64",
    });
    const tree = await client.rest.git.createTree({
      owner,
      repo,
      tree: [{ path: "README.md", mode: "100644", type: "blob", sha: blob.data.sha }],
    });
    const commit = await client.rest.git.createCommit({
      owner,
      repo,
      message: `chore(feedback): initialize ${branch} branch`,
      tree: tree.data.sha,
      parents: [], // orphan — no parent commit
    });
    await client.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: commit.data.sha,
    });
    console.log(`${LOG_PREFIX} created orphan branch ${branch}`);
  } catch (err) {
    // A concurrent request may have created it first (422 "Reference already
    // exists") — that's fine, the branch now exists. Anything else is fatal.
    if (!isStatus(err, 422)) {
      console.error(`${LOG_PREFIX} could not create ${branch} branch`, err);
      throw err;
    }
  }
  branchReady = branch;
}

function isStatus(err: unknown, status: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === status
  );
}
