import { NextResponse } from "next/server";

// Server-side proxy for GitHub's public repo API. Keeps api.github.com out of
// the browser's connect-src CSP — the client never talks to GitHub directly.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url") || "";

  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/);
  if (!match) {
    return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
  }
  const [, owner, repo] = match;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const data = await res.json();
  return NextResponse.json(
    { name: data.name, description: data.description },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
