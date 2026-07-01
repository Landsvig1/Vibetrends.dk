import { NextResponse } from "next/server";
import { parseGithubRepoUrl } from "@/lib/github";

// Server-side proxy for GitHub's public repo API. Keeps api.github.com out of
// the browser's connect-src CSP — the client never talks to GitHub directly.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url") || "";

  const parsed = parseGithubRepoUrl(url);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
  }
  const { owner, repo } = parsed;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        // Without a token, GitHub's unauthenticated rate limit (60 req/hr) is
        // pooled across every visitor sharing Vercel's egress IP. Set
        // GITHUB_TOKEN to bump that to 5000 req/hr.
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });

    if (res.status === 403 || res.status === 429) {
      return NextResponse.json({ error: "Rate limited" }, { status: 503 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Repo not found" }, { status: 404 });
    }

    const data = await res.json();
    return NextResponse.json(
      { name: data.name, description: data.description },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch {
    return NextResponse.json({ error: "Failed to reach GitHub" }, { status: 502 });
  }
}
