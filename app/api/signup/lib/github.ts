import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

const LOG_PREFIX = "[signup][github]";

export async function inviteCollaborator(
  githubUsername: string,
  dryRun: boolean,
): Promise<void> {
  const org = required("GH_ORG");
  const repo = required("GH_REPO");

  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would invite ${githubUsername} to ${org}/${repo}`,
    );
    return;
  }

  const appId = required("GH_APP_ID");
  const installationId = required("GH_APP_INSTALLATION_ID");
  const privateKey = required("GH_APP_PRIVATE_KEY").replace(/\\n/g, "\n");

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(appId),
      privateKey,
      installationId: Number(installationId),
    },
  });

  const response = await octokit.rest.repos.addCollaborator({
    owner: org,
    repo,
    username: githubUsername,
    permission: "pull",
  });

  console.log(
    `${LOG_PREFIX} invited ${githubUsername} to ${org}/${repo} (status ${response.status})`,
  );
}

export function getInvitationUrl(org: string, repo: string): string {
  return `https://github.com/${org}/${repo}/invitations`;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
