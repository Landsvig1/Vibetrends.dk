import { describe, it, expect } from "vitest";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import nextConfig from "../../../next.config";

/**
 * Next streams metadata into <body> for every client outside htmlLimitedBots,
 * and Googlebot is outside the default list. On this site's dynamic detail
 * pages (/mcp, /cli, /skills, /vibes, /agents slugs) that left Googlebot's HTML
 * with no <title>, description or canonical at all: the tags only existed in
 * the RSC payload. Google-InspectionTool IS on the default list, so URL
 * Inspection's live test saw a correct <head> and hid the bug.
 */

const GOOGLEBOT_UAS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/141.0.0.0 Safari/537.36",
];

describe("htmlLimitedBots", () => {
  const re = nextConfig.htmlLimitedBots;

  it("is set, so it can be checked at all", () => {
    expect(re).toBeInstanceOf(RegExp);
  });

  it.each(GOOGLEBOT_UAS)("gives Googlebot blocking metadata in <head>: %s", (ua) => {
    expect(re!.test(ua)).toBe(true);
  });

  it("keeps every bot from Next's default list, since setting the option replaces it", () => {
    for (const ua of ["Google-InspectionTool/1.0", "bingbot/2.0", "facebookexternalhit/1.1", "LinkedInBot/1.0", "Slackbot"]) {
      expect(HTML_LIMITED_BOT_UA_RE.test(ua)).toBe(true);
      expect(re!.test(ua)).toBe(true);
    }
  });

  it("still streams metadata to ordinary browsers", () => {
    expect(
      re!.test("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"),
    ).toBe(false);
  });
});
