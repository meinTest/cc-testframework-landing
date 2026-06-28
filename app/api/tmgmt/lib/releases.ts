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

// Installable artifact per OS, matched by extension so versioned names resolve
// automatically. .yml/.blockmap sidecar files are ignored.
const OS_ASSET_PATTERN: Record<TargetOs, RegExp> = {
  win: /\.exe$/i,
  mac: /\.dmg$/i,
  linux: /\.AppImage$/i,
};

/** Name of the installable asset for an OS in the latest release, or null. */
export async function resolveOsAssetName(
  os: TargetOs,
  dryRun: boolean,
): Promise<string | null> {
  const assets = await getLatestAssets(dryRun);
  const match = assets?.find((a) => OS_ASSET_PATTERN[os].test(a.name));
  return match ? match.name : null;
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

/** Return the text content of a feed file (e.g. latest-linux.yml), or null if absent. */
export async function getFeedText(
  filename: string,
  dryRun: boolean,
): Promise<string | null> {
  const assets = await getLatestAssets(dryRun);
  const asset = assets?.find((a) => a.name === filename);
  if (!asset) return null;

  if (dryRun) {
    return [
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
): Promise<string | null> {
  const assets = await getLatestAssets(dryRun);
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
