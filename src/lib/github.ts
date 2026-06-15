import { Octokit } from "@octokit/rest";

const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "kasperlandsvig";
const GITHUB_REPO = process.env.GITHUB_REPO || "vibetrends-dk";
const DB_PATH = "src/data/db.json";

const octokit = new Octokit({ auth: GITHUB_ACCESS_TOKEN });

export async function getDbData() {
  // If we are in build time or no token, we can't fetch from GitHub API reliably without hitting limits
  // or we might want to just read from the local file if it exists.
  // However, for Path B in the skill, we fetch from GitHub.
  
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: DB_PATH,
    });

    if ("content" in data) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Failed to fetch DB from GitHub, falling back to local initial data", error);
  }
  
  // Fallback to initial data if file doesn't exist on GitHub yet
  const initialDbData = (await import("../data/db.json")).default;
  return initialDbData;
}

export async function saveDbData(data: any) {
  if (!GITHUB_ACCESS_TOKEN) {
    console.warn("GITHUB_ACCESS_TOKEN not set, data will not be persisted to GitHub");
    return false;
  }

  try {
    let sha;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: DB_PATH,
      });
      if ("sha" in fileData && !Array.isArray(fileData)) {
        sha = (fileData as { sha: string }).sha;
      }
    } catch (e) {
      // File doesn't exist yet
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: DB_PATH,
      message: "chore: update database content [skip ci]",
      content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
      sha,
    });
    
    return true;
  } catch (error) {
    console.error("Failed to save DB to GitHub", error);
    return false;
  }
}
