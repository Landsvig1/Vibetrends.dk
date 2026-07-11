import { describe, it, expect } from "vitest";
import { parseGithubRepoUrl } from "../github";

describe("parseGithubRepoUrl", () => {
  it("parses valid GitHub repository URLs correctly", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("handles www. prefix", () => {
    expect(parseGithubRepoUrl("https://www.github.com/facebook/react")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("strips .git suffix", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react.git")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("handles trailing subpaths", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react/tree/main")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("strips query parameters", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react?tab=readme-ov-file")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("strips hash fragments", () => {
    expect(parseGithubRepoUrl("https://github.com/facebook/react#readme")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("handles trailing subpaths with query parameters and hash", () => {
    expect(
      parseGithubRepoUrl("https://github.com/facebook/react/blob/main/README.md?foo=bar#section")
    ).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("rejects non-GitHub URLs", () => {
    expect(parseGithubRepoUrl("https://gitlab.com/facebook/react")).toBeNull();
    expect(parseGithubRepoUrl("https://evil.example.com/facebook/react")).toBeNull();
  });

  it("rejects URLs with malicious/invalid characters in owner or repo", () => {
    // Non-alphanumeric, non-hyphen/underscore/period characters should fail
    expect(parseGithubRepoUrl("https://github.com/owner/repo@attacker.com")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/owner/repo:something")).toBeNull();
    expect(parseGithubRepoUrl("https://github.com/owner/repo<script>")).toBeNull();
  });
});
