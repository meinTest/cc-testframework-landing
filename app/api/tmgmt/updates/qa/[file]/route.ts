import { handleQaUpdateFile } from "../../../lib/handlers";

// Internal QA update feed for cc-tmgmt (#30). The QA app (generic electron-updater
// provider) points its base URL here and sends the Keygen license key as
// `Authorization: Bearer <key>`. Served from the newest pre-release carrying a
// qa.yml, and gated to internal (channel:qa) licenses only — a customer key gets
// 403 { error: "qa-channel-not-entitled" }. The customer feed
// (/api/tmgmt/updates/<file>) is unaffected.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  return handleQaUpdateFile(request, file);
}
