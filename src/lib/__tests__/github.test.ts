import { describe, it, expect } from "vitest";
import { parseGithubRepoUrl } from "../github";

describe("parseGithubRepoUrl", () => {
  it("parses standard GitHub URLs correctly", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseGithubRepoUrl("http://github.com/facebook/react")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseGithubRepoUrl("https://www.github.com/facebook/react")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("handles .git suffix correctly", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react.git")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("handles trailing subpaths correctly", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react/tree/main")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseGithubRepoUrl("https://github.com/facebook/react/blob/main/README.md")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseGithubRepoUrl("https://github.com/facebook/react/issues/123")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("strips query parameters and hash fragments to prevent parameter injection", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react?tab=readme-ov-file")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseGithubRepoUrl("https://github.com/facebook/react#readme")).toEqual({
      owner: "facebook",
      repo: "react",
    });
    expect(parseGithubRepoUrl("https://github.com/facebook/react?foo=bar&baz=qux#readme")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("rejects invalid characters in owner or repo segments", () => {
    // Space or slashes
    expect(parseGithubRepoUrl("https://github.com/face book/react")).toBeNull();

    // Non-whitelisted characters in owner (only alphanumeric and hyphens allowed)
    expect(parseGithubRepoUrl("https://github.com/face_book/react")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/face.book/react")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/face$book/react")).toBeNull();

    // Non-whitelisted characters in repo (only alphanumeric, hyphens, underscores, dots allowed)
    expect(parseGithubRepoUrl("https://github.com/facebook/react$app")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/facebook/react%20app")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/facebook/react;app")).toBeNull();
  });

  it("enforces length limits on owner and repo segments", () => {
    // Owner max 39 characters
    const longOwner = "a".repeat(40);
    expect(parseGithubRepoUrl(`https://github/${longOwner}/react`)).toBeNull();

    // Repo max 100 characters
    const longRepo = "b".repeat(101);
    expect(parseGithubRepoUrl(`https://github/facebook/${longRepo}`)).toBeNull();
  });

  it("returns null for non-GitHub or malformed URLs", () => {
    expect(parseGithubRepoUrl("https://gitlab.com/facebook/react")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/facebook")).toBeNull();
    expect(parseGithubRepoUrl("not-a-url")).toBeNull();
    expect(parseGithubRepoUrl(null as unknown as string)).toBeNull();
    expect(parseGithubRepoUrl(undefined as unknown as string)).toBeNull();
  });
});
