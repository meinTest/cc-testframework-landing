import { handleDownload } from "../tmgmt/lib/handlers";

// Neutral alias of /api/tmgmt/download. License-gated first-download entry point
// linked from the welcome mail: GET /api/download?os=win&key=<license-key>.
// Resolves the current installable for the requested OS at click time and 302s
// to the signed GitHub asset URL. Shared logic in ../tmgmt/lib/handlers; the
// /api/tmgmt/download path stays as back-compat.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleDownload(request);
}
