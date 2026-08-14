import { randomUUID } from "node:crypto";
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
// Everything here degrades gracefully: invalid/oversized images are dropped and
// an upload failure (e.g. the App lacking Contents:write) skips that image — the
// feedback report is still filed, just without the affected screenshot.

const LOG_PREFIX = "[feedback][screenshots]";

// Client already caps at 6 images / ≤6 MB each; re-enforce server-side since
// client limits are not security. ~8 MB decoded leaves headroom over the client cap.
const MAX_IMAGES = 6;
const MAX_DECODED_BYTES = 8 * 1024 * 1024;

// Only these three image types, base64-encoded, are accepted.
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/;

export interface ParsedImage {
  buffer: Buffer;
  ext: "png" | "jpg" | "webp";
}

/**
 * Parse the raw `images` field into validated image buffers. Non-strings,
 * wrong MIME types, undecodable base64, empty and oversized entries are all
 * silently dropped; at most MAX_IMAGES are returned. Never throws.
 */
export function parseImages(raw: unknown): ParsedImage[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedImage[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_IMAGES) break;
    if (typeof entry !== "string") continue;
    const match = DATA_URL_RE.exec(entry.trim());
    if (!match) continue;
    const [, subtype, b64] = match;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64.replace(/\s+/g, ""), "base64");
    } catch {
      continue;
    }
    if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) continue;
    const ext = subtype === "jpeg" ? "jpg" : (subtype as "png" | "webp");
    out.push({ buffer, ext });
  }
  return out;
}

/**
 * Upload each image to the feedback repo and return its github.com blob-view URL,
 * in the same order. Individual upload failures are logged and skipped (that
 * image is omitted); the batch never throws for a single failed image.
 */
export async function uploadImages(
  images: ParsedImage[],
  dryRun: boolean,
): Promise<string[]> {
  if (images.length === 0) return [];

  // Group all of a report's screenshots under one unguessable folder.
  const folder = randomUUID();
  const branch = process.env.FEEDBACK_ASSETS_BRANCH || "main";

  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would upload ${images.length} image(s) to ${folder}/`);
    return images.map(
      (img, i) =>
        `https://github.com/DRYRUN/DRYRUN/blob/${branch}/feedback-assets/${folder}/${i + 1}.${img.ext}`,
    );
  }

  const { owner, repo } = repoCoords();
  const client = octokit();
  const urls: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const path = `feedback-assets/${folder}/${i + 1}.${img.ext}`;
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

  console.log(`${LOG_PREFIX} uploaded ${urls.length}/${images.length} image(s) to ${folder}/`);
  return urls;
}
