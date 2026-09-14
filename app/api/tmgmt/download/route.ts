import { handleDownload } from "../lib/handlers";

// Human-facing first-download entry point, linked from the cc-tmgmt welcome
// mail: GET /api/tmgmt/download?os=win&key=<license-key>. License-gated; resolves
// the current installable for the requested OS at click time (so the mailed link
// never goes stale) and 302s to the signed GitHub asset URL.
//
// Back-compat alias — the shared logic lives in ../lib/handlers. The neutral
// path is /api/download.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleDownload(request);
}
