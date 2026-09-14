import { handleNpm } from "../../tmgmt/lib/handlers";

// Neutral alias of /api/tmgmt/npm/. License-brokered npm registry for
// @meintest/* (GitHub Packages). Clients set
//   @meintest:registry=<origin>/api/npm/
//   //<origin>/api/npm/:_authToken=${CC_LICENSE_KEY}
// and can `npm install @meintest/…` with only a valid license — no GitHub access.
// Shared logic in ../../tmgmt/lib/handlers; the /api/tmgmt/npm path stays as
// back-compat. The mount prefix is passed so the packument's tarball URLs point
// back at this same mount.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleNpm(request, "/api/npm/");
}
