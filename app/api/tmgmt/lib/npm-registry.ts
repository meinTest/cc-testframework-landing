import { createAppAuth } from "@octokit/auth-app";

// License-brokered proxy for the private @meintest/* npm packages on GitHub
// Packages. The customer authenticates with their Keygen license (Bearer); the
// GitHub App service token stays server-side and never reaches the client.

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

async function fetchRawPackument(pkg: string): Promise<RawPackument> {
  const now = Date.now();
  const hit = packumentCache.get(pkg);
  if (hit && now - hit.at < PACKUMENT_TTL_MS) return hit.data;

  const token = await packagesAuthToken();
  const res = await fetch(`${GH_NPM}/@meintest%2f${encodeURIComponent(pkg)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new NpmProxyError(res.status === 404 ? 404 : 502, `packument ${res.status}`);
  }
  const data = (await res.json()) as RawPackument;
  packumentCache.set(pkg, { at: now, data });
  return data;
}

/** Packument with every tarball URL rewritten to point back at this proxy. */
export async function getProxiedPackument(
  pkg: string,
  proxyBase: string,
): Promise<unknown> {
  const raw = await fetchRawPackument(pkg);
  const out = structuredClone(raw);
  for (const version of Object.values(out.versions ?? {})) {
    const dist = version?.dist;
    if (dist?.tarball) {
      const filename = tarballFilename(dist.tarball);
      // integrity/shasum are left untouched so npm's verification still holds.
      dist.tarball = `${proxyBase}/@meintest/${pkg}/-/${filename}`;
    }
  }
  return out;
}

/** Original GitHub tarball URL for a proxied `<pkg>/-/<filename>.tgz`, or null. */
export async function resolveOriginalTarball(
  pkg: string,
  filename: string,
): Promise<string | null> {
  const raw = await fetchRawPackument(pkg);
  for (const version of Object.values(raw.versions ?? {})) {
    const tarball = version?.dist?.tarball;
    if (tarball && tarballFilename(tarball) === filename) return tarball;
  }
  return null;
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
