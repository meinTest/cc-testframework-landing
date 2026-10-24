import { createAppAuth } from "@octokit/auth-app";

// License-brokered proxy for the private @meintest/* and @itsbusinessag/* npm
// packages on GitHub Packages. During the org move both scopes are served in
// parallel — @meintest against the meinTest org, @itsbusinessag against the
// itsbusinessAG org — so existing customer projects keep installing while new
// ones use the new scope; there is no shutdown date for @meintest/* (#57). The
// customer authenticates with their Keygen license (Bearer); the service token
// stays server-side and never reaches the client, and must be able to read
// packages in BOTH orgs (a classic PAT with read:packages visible in both).

const GH_NPM = "https://npm.pkg.github.com";
const PACKUMENT_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 50 * 60 * 1000; // installation tokens live ~1h

export class NpmProxyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Dist {
  tarball?: string;
  integrity?: string;
  shasum?: string;
}
interface RawPackument {
  versions?: Record<string, { dist?: Dist } & Record<string, unknown>>;
  [k: string]: unknown;
}

// Both scopes served during the org move. Anything outside them is rejected so
// the proxy never becomes an open registry mirror (#1, #57).
export const NPM_SCOPES = ["@meintest", "@itsbusinessag"] as const;

// @<scope>/<pkg>/-/<file> — GitHub Packages names the tarball with a bare SHA
// (no .tgz extension), so match anything after `/-/`.
const TARBALL_RE = /^(@meintest|@itsbusinessag)\/([^/]+)\/-\/(.+)$/;
// @<scope>/<pkg>
const PACKUMENT_RE = /^(@meintest|@itsbusinessag)\/([^/]+)$/;

export type NpmSpec =
  | { kind: "tarball"; scope: string; pkg: string; filename: string }
  | { kind: "packument"; scope: string; pkg: string }
  | { kind: "not-found" } // an allowed scope but an unrecognized shape → 404
  | { kind: "reject" }; //  any other scope → 403 (never an open mirror)

/**
 * Classify a raw npm spec (`@scope/pkg` or `@scope/pkg/-/file`). An allowed
 * scope with an unknown shape is `not-found` (→404); any other scope is
 * `reject` (→403). The matched scope is carried through so the upstream fetch
 * and the cache key stay per-scope (#57).
 */
export function parseNpmSpec(spec: string): NpmSpec {
  const tar = TARBALL_RE.exec(spec);
  if (tar) return { kind: "tarball", scope: tar[1], pkg: tar[2], filename: tar[3] };
  const pack = PACKUMENT_RE.exec(spec);
  if (pack) return { kind: "packument", scope: pack[1], pkg: pack[2] };
  if (NPM_SCOPES.some((s) => spec.startsWith(`${s}/`))) return { kind: "not-found" };
  return { kind: "reject" };
}

let tokenCache: { at: number; token: string } | null = null;
const packumentCache = new Map<string, { at: number; data: RawPackument }>();

// Credential for npm.pkg.github.com. GitHub's npm registry does NOT accept
// GitHub App installation tokens (returns 403 even with packages:read), so a
// scoped GH_PACKAGES_TOKEN (fine-grained PAT with packages:read, or classic PAT
// with read:packages) is used when set. The App token remains as a fallback.
async function packagesAuthToken(): Promise<string> {
  const pat = process.env.GH_PACKAGES_TOKEN;
  if (pat) return pat;
  return installationToken();
}

async function installationToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && now - tokenCache.at < TOKEN_TTL_MS) return tokenCache.token;
  const appId = required("GH_APP_ID");
  const installationId = required("GH_APP_INSTALLATION_ID");
  const privateKey = required("GH_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  const auth = createAppAuth({
    appId: Number(appId),
    privateKey,
    installationId: Number(installationId),
  });
  const { token } = await auth({ type: "installation" });
  tokenCache = { at: now, token };
  return token;
}

async function fetchRawPackument(scope: string, pkg: string): Promise<RawPackument> {
  const now = Date.now();
  // Keyed per scope: @meintest/cc-testframework and @itsbusinessag/cc-testframework
  // are different packages in different orgs and must never share a cache slot (#57).
  const cacheKey = `${scope}/${pkg}`;
  const hit = packumentCache.get(cacheKey);
  if (hit && now - hit.at < PACKUMENT_TTL_MS) return hit.data;

  const token = await packagesAuthToken();
  // GitHub Packages resolves the scope against the matching org (@meintest →
  // meinTest, @itsbusinessag → itsbusinessAG), so the requested scope is carried
  // through verbatim rather than hardcoded.
  const res = await fetch(`${GH_NPM}/${scope}%2f${encodeURIComponent(pkg)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new NpmProxyError(res.status === 404 ? 404 : 502, `packument ${res.status}`);
  }
  const data = (await res.json()) as RawPackument;
  packumentCache.set(cacheKey, { at: now, data });
  return data;
}

/**
 * Packument with every tarball URL rewritten to point back at this proxy. When
 * `includePrereleases` is false (a normal customer license), pre-release versions
 * and the dist-tags that point at them (e.g. `rc`) are stripped, so customers
 * only ever see the stable `latest` chain (cc-testframework#216). Internal
 * (channel:qa) licenses get the full packument.
 */
export async function getProxiedPackument(
  scope: string,
  pkg: string,
  proxyBase: string,
  includePrereleases: boolean,
): Promise<unknown> {
  const raw = await fetchRawPackument(scope, pkg);
  const out = structuredClone(raw);
  if (!includePrereleases) stripPrereleases(out);
  for (const version of Object.values(out.versions ?? {})) {
    const dist = version?.dist;
    if (dist?.tarball) {
      const filename = tarballFilename(dist.tarball);
      // integrity/shasum are left untouched so npm's verification still holds.
      dist.tarball = `${proxyBase}/${scope}/${pkg}/-/${filename}`;
    }
  }
  return out;
}

export type TarballResolution =
  | { kind: "ok"; url: string }
  | { kind: "forbidden" } // a pre-release tarball requested by a non-internal license
  | { kind: "not-found" };

/**
 * Resolve a proxied `<pkg>/-/<filename>` to its original GitHub tarball URL.
 * A pre-release version's tarball requested without `includePrereleases` is
 * `forbidden` (→ 403 qa-channel-not-entitled), so a customer can't fetch an rc
 * build even by guessing its URL; a genuinely unknown filename is `not-found`.
 */
export async function resolveOriginalTarball(
  scope: string,
  pkg: string,
  filename: string,
  includePrereleases: boolean,
): Promise<TarballResolution> {
  const raw = await fetchRawPackument(scope, pkg);
  return matchTarball(raw.versions, filename, includePrereleases);
}

/** Pure filename → tarball resolution over a versions map (unit-tested). */
export function matchTarball(
  versions: RawPackument["versions"],
  filename: string,
  includePrereleases: boolean,
): TarballResolution {
  for (const [ver, version] of Object.entries(versions ?? {})) {
    const tarball = version?.dist?.tarball;
    if (tarball && tarballFilename(tarball) === filename) {
      if (isPrerelease(ver) && !includePrereleases) return { kind: "forbidden" };
      return { kind: "ok", url: tarball };
    }
  }
  return { kind: "not-found" };
}

/** A semver pre-release (has a `-`, e.g. 1.3.0-rc.1). */
export function isPrerelease(version: string): boolean {
  return version.includes("-");
}

/**
 * Strip pre-release versions from a packument in place: removes them from
 * `versions` and `time`, and drops any dist-tag (e.g. `rc`) pointing at one.
 * `latest` is a stable version by convention and is left as-is.
 */
export function stripPrereleases(pack: RawPackument): void {
  if (pack.versions) {
    for (const v of Object.keys(pack.versions)) {
      if (isPrerelease(v)) delete pack.versions[v];
    }
  }
  const time = pack.time as Record<string, unknown> | undefined;
  if (time) {
    for (const v of Object.keys(time)) {
      if (v !== "created" && v !== "modified" && isPrerelease(v)) delete time[v];
    }
  }
  const distTags = pack["dist-tags"] as Record<string, string> | undefined;
  if (distTags) {
    for (const tag of Object.keys(distTags)) {
      if (isPrerelease(distTags[tag])) delete distTags[tag];
    }
  }
}

/** Fetch a tarball from GitHub Packages with the service token (for streaming). */
export function fetchTarball(url: string): Promise<Response> {
  return packagesAuthToken().then((token) =>
    fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" },
    }),
  );
}

function tarballFilename(url: string): string {
  return url.split("?")[0].split("/").pop() ?? "";
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
