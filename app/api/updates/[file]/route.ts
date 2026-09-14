import { handleUpdateFile } from "../../tmgmt/lib/handlers";

// Neutral alias of /api/tmgmt/updates/<file>. electron-updater (generic
// provider) points its base URL here with the Keygen key as `Authorization:
// Bearer <key>`; serves *.yml feed files (proxied text) or 302-redirects to a
// short-lived GitHub asset URL. Shared logic in ../../tmgmt/lib/handlers; the
// /api/tmgmt/updates path stays as back-compat.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  return handleUpdateFile(request, file);
}
