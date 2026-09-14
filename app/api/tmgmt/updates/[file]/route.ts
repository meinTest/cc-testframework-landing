import { handleUpdateFile } from "../../lib/handlers";

// cc-tmgmt update/download proxy (Option A — keyGen-Proxy). electron-updater
// (generic provider) points its base URL here and sends the Keygen license key
// as `Authorization: Bearer <key>`. This OS-agnostic catch-all serves *.yml feed
// files (proxied text) or 302-redirects to a short-lived GitHub asset URL.
//
// Back-compat alias — the shared logic lives in ../../lib/handlers. The neutral
// path is /api/updates/<file>.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  return handleUpdateFile(request, file);
}
