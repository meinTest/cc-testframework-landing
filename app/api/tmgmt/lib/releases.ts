import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

// Server-side read access to the private cc-tmgmt release repo. The customer
// never gets GitHub access — we resolve the latest release with our GitHub App
// installation token and either return a feed file's text or a short-lived
// redirect URL for a binary asset. Asset names are resolved from the release,
// never hardcoded, so new versions/architectures work automatically.

const LOG_PREFIX = "[tmgmt][releases]";

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
}

export type TargetOs = "win" | "mac" | "linux";

// Delivery channel: the customer "stable" channel (latest real release) or the
// internal "qa" channel (latest pre-release carrying a qa.yml). #30.
export type ReleaseChannel = "stable" | "qa";

// Installable artifact per OS, matched by extension so versioned names resolve
// automatically. .yml/.blockmap sidecar files are ignored.
const OS_ASSET_PATTERN: Record<TargetOs, RegExp> = {
  win: /\.exe$/i,
  mac: /\.dmg$/i,
  linux: /\.AppImage$/i,
};

/** Name of the installable asset for an OS in the channel's release, or null. */
export async function resolveOsAssetName(
  os: TargetOs,
  dryRun: boolean,
  channel: ReleaseChannel = "stable",
): Promise<string | null> {
  const assets = await getChannelAssets(channel, dryRun);
  const match = assets?.find((a) => OS_ASSET_PATTERN[os].test(a.name));
  return match ? match.name : null;
}

// Assets of the channel's active release (stable = latest real release; qa =
// newest pre-release with a qa.yml).
function getChannelAssets(
  channel: ReleaseChannel,
  dryRun: boolean,
): Promise<ReleaseAsset[] | null> {
  return channel === "qa" ? getQaAssets(dryRun) : getLatestAssets(dryRun);
}

/** Latest release assets, keyed by file name. Returns null if there is no release. */
export async function getLatestAssets(
  dryRun: boolean,
): Promise<ReleaseAsset[] | null> {
  if (dryRun) {
    // Mirror a real electron-builder cross-OS release for smoke tests.
    return [
      { id: 1, name: "latest.yml", size: 512 },
      { id: 2, name: "latest-linux.yml", size: 512 },
      { id: 3, name: "latest-mac.yml", size: 512 },
      { id: 4, name: "cc-tmgmt-0.5.0-win-x64.exe", size: 90_000_000 },
      { id: 5, name: "cc-tmgmt-0.5.0-linux-x86_64.AppImage", size: 95_000_000 },
      { id: 6, name: "cc-tmgmt-0.5.0-mac-arm64.dmg", size: 110_000_000 },
    ];
  }

  const { owner, repo } = repoCoords();
  const octokit = appOctokit();

  try {
    const release = await octokit.rest.repos.getLatestRelease({ owner, repo });
    const assets = release.data.assets.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
    }));
    console.log(
      `${LOG_PREFIX} latest release ${release.data.tag_name} with ${assets.length} assets`,
    );
    return assets;
  } catch (err) {
    if (isNotFound(err)) {
      console.warn(`${LOG_PREFIX} no latest release for ${owner}/${repo}`);
      return null;
    }
    throw err;
  }
}

// --- QA channel: newest PRE-RELEASE carrying a qa.yml (#30) ------------------

// Candidates change often, so cache briefly and separately from the customer
// channel. A ≤60s TTL keeps GitHub calls down without hiding a fresh candidate.
const QA_TTL_MS = 60 * 1000;
let qaCache: { at: number; assets: ReleaseAsset[] | null } | null = null;

/** Assets of the newest pre-release that has a qa.yml, or null. Short-cached. */
export async function getQaAssets(dryRun: boolean): Promise<ReleaseAsset[] | null> {
  if (dryRun) {
    return [
      { id: 11, name: "qa.yml", size: 512 },
      { id: 12, name: "cc-tmgmt-qa-0.6.0-rc.1-win-x64.exe", size: 92_000_000 },
      { id: 13, name: "cc-tmgmt-qa-0.6.0-rc.1-win-x64.exe.blockmap", size: 90_000 },
    ];
  }
  const now = Date.now();
  if (qaCache && now - qaCache.at < QA_TTL_MS) return qaCache.assets;
  const assets = await fetchLatestQaAssets();
  qaCache = { at: now, assets };
  return assets;
}

// getLatestRelease deliberately skips pre-releases, so we list releases
// (newest-first) and pick the first PRE-RELEASE that actually carries a qa.yml.
async function fetchLatestQaAssets(): Promise<ReleaseAsset[] | null> {
  const { owner, repo } = repoCoords();
  const octokit = appOctokit();
  const res = await octokit.rest.repos.listReleases({ owner, repo, per_page: 30 });
  const rel = res.data.find(
    (r) => r.prerelease && !r.draft && r.assets.some((a) => a.name === "qa.yml"),
  );
  if (!rel) {
    console.warn(`${LOG_PREFIX} no qa pre-release with a qa.yml in the latest 30 releases`);
    return null;
  }
  console.log(`${LOG_PREFIX} qa pre-release ${rel.tag_name} with ${rel.assets.length} assets`);
  return rel.assets.map((a) => ({ id: a.id, name: a.name, size: a.size }));
}

/** Return the text content of a feed file, or null if absent. */
export async function getFeedText(
  filename: string,
  dryRun: boolean,
  channel: ReleaseChannel = "stable",
): Promise<string | null> {
  const assets = await getChannelAssets(channel, dryRun);
  const asset = assets?.find((a) => a.name === filename);
  if (!asset) return null;

  if (dryRun) {
    return channel === "qa"
      ? [
          "version: 0.6.0-rc.1",
          "files:",
          "  - url: cc-tmgmt-qa-0.6.0-rc.1-win-x64.exe",
          "    sha512: DRYRUN",
          "    size: 92000000",
          "path: cc-tmgmt-qa-0.6.0-rc.1-win-x64.exe",
          "releaseDate: '2026-09-22T00:00:00.000Z'",
          "",
        ].join("\n")
      : [
          "version: 0.5.0",
          "files:",
          "  - url: cc-tmgmt-0.5.0-linux-x86_64.AppImage",
          "    sha512: DRYRUN",
          "    size: 95000000",
          "path: cc-tmgmt-0.5.0-linux-x86_64.AppImage",
          "releaseDate: '2026-06-28T00:00:00.000Z'",
          "",
        ].join("\n");
  }

  const { owner, repo } = repoCoords();
  const octokit = appOctokit();
  const response = await octokit.rest.repos.getReleaseAsset({
    owner,
    repo,
    asset_id: asset.id,
    headers: { accept: "application/octet-stream" },
  });
  // With the octet-stream accept header octokit returns the raw bytes.
  const data = response.data as unknown as ArrayBuffer;
  return Buffer.from(data).toString("utf8");
}

/**
 * Resolve a short-lived signed URL for a binary asset without downloading it.
 * Requests the asset with a manual redirect and returns the Location header
 * (a time-limited storage URL). Returns null if the asset is not in the release.
 */
export async function getAssetRedirectUrl(
  filename: string,
  dryRun: boolean,
  channel: ReleaseChannel = "stable",
): Promise<string | null> {
  const assets = await getChannelAssets(channel, dryRun);
  const asset = assets?.find((a) => a.name === filename);
  if (!asset) return null;

  if (dryRun) {
    return `https://example.invalid/dry-run/${encodeURIComponent(filename)}`;
  }

  const { owner, repo } = repoCoords();
  const token = await installationToken();
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/octet-stream",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "manual",
    },
  );

  const location = response.headers.get("location");
  if (!location) {
    console.error(
      `${LOG_PREFIX} expected redirect for asset ${filename}, got HTTP ${response.status}`,
    );
    return null;
  }
  return location;
}

function repoCoords(): { owner: string; repo: string } {
  return {
    owner: required("GH_ORG"),
    repo: required("GH_TMGMT_REPO"),
  };
}

function appOctokit(): Octokit {
  const appId = required("GH_APP_ID");
  const installationId = required("GH_APP_INSTALLATION_ID");
  const privateKey = required("GH_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(appId),
      privateKey,
      installationId: Number(installationId),
    },
  });
}

async function installationToken(): Promise<string> {
  const appId = required("GH_APP_ID");
  const installationId = required("GH_APP_INSTALLATION_ID");
  const privateKey = required("GH_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  const auth = createAppAuth({
    appId: Number(appId),
    privateKey,
    installationId: Number(installationId),
  });
  const { token } = await auth({ type: "installation" });
  return token;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 404
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
