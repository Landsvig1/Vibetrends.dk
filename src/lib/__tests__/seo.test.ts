import { describe, it, expect } from "vitest";
import { entityMetadata } from "@/lib/seo";

describe("entityMetadata", () => {
  it("sets a language-agnostic canonical and maps lang to og:locale", () => {
    const da = entityMetadata({ title: "T", description: "D", path: "/skills/s1", lang: "da" });
    expect(da.alternates?.canonical).toBe("/skills/s1");
    expect((da.openGraph as { locale?: string }).locale).toBe("da_DK");
    expect((da.openGraph as { url?: string }).url).toBe("/skills/s1");

    const en = entityMetadata({ title: "T", description: "D", path: "/skills/s1", lang: "en" });
    expect((en.openGraph as { locale?: string }).locale).toBe("en_US");
  });

  it("omits images when none is provided, includes them when present", () => {
    const without = entityMetadata({ title: "T", description: "D", path: "/blog/b1" });
    expect((without.openGraph as { images?: unknown }).images).toBeUndefined();

    const withImg = entityMetadata({ title: "T", description: "D", path: "/blog/b1", image: "/og.png" });
    expect((withImg.openGraph as { images?: unknown[] }).images).toEqual([{ url: "/og.png" }]);
    expect((withImg.twitter as { images?: unknown[] }).images).toEqual(["/og.png"]);
  });

  it("defaults og:type to website and honors an article override", () => {
    expect((entityMetadata({ title: "T", description: "D", path: "/x" }).openGraph as { type?: string }).type).toBe("website");
    expect(
      (entityMetadata({ title: "T", description: "D", path: "/x", type: "article" }).openGraph as { type?: string }).type
    ).toBe("article");
  });
});
