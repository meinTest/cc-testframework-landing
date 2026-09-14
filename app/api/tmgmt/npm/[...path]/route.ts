import { handleNpm } from "../../lib/handlers";

// License-brokered npm registry for @meintest/* (GitHub Packages). Clients set
//   @meintest:registry=<origin>/api/tmgmt/npm/
//   //<origin>/api/tmgmt/npm/:_authToken=${CC_LICENSE_KEY}
// and can `npm install @meintest/…` with only a valid license — no GitHub access.
//
// Back-compat alias — the shared logic lives in ../../lib/handlers. The neutral
// path is /api/npm/. The mount prefix is passed so the packument's tarball URLs
// point back at this same mount.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleNpm(request, "/api/tmgmt/npm/");
}
