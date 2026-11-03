import { describe, it, expect } from "vitest";
import { deriveUsername } from "@/lib/username";
import { isReservedAuthor, mayUseReservedAuthor, RESERVED_AUTHOR_NAMES } from "@/lib/reservedNames";
import { ADMIN_USER_IDS, CURATOR_BOT_USER_ID } from "@/lib/permissions";
import { contentWriteErrorFrom } from "@/lib/contentWriteErrors";

describe("deriveUsername", () => {
  it("derives agent_<first 8 of id> for an anonymous user and ignores full_name", () => {
    expect(
      deriveUsername({
        id: "1234abcd-5678-90ef-aaaa-bbbbccccdddd",
        email: "",
        is_anonymous: true,
        user_metadata: { full_name: "kasper" },
      })
    ).toBe("agent_1234abcd");
  });

  it("uses full_name for a non-anonymous user", () => {
    expect(
      deriveUsername({ id: "u1", email: "person@example.com", is_anonymous: false, user_metadata: { full_name: "Person P" } })
    ).toBe("Person P");
  });

  it("falls back to the sanitized email local-part with _vibe", () => {
    expect(deriveUsername({ id: "u1", email: "per.son@example.com", user_metadata: {} })).toBe("per_son_vibe");
  });
});

describe("isReservedAuthor", () => {
  it("matches reserved names case-insensitively after trimming", () => {
    expect(isReservedAuthor("Kasper ")).toBe(true);
    expect(isReservedAuthor("  LANDSVIG1")).toBe(true);
    expect(isReservedAuthor("Vibetrends Bot")).toBe(true);
    expect(isReservedAuthor("Kasper Landsvig")).toBe(true);
    expect(isReservedAuthor("vibes-bot")).toBe(true);
  });

  it("does not match ordinary names or names that only contain a reserved word", () => {
    expect(isReservedAuthor("person_vibe")).toBe(false);
    expect(isReservedAuthor("kasper_fan")).toBe(false);
    expect(isReservedAuthor("agent_1234abcd")).toBe(false);
  });

  it("keeps the list normalized so the lookup can compare lowercase trimmed input", () => {
    for (const name of RESERVED_AUTHOR_NAMES) expect(name).toBe(name.trim().toLowerCase());
  });
});

describe("mayUseReservedAuthor", () => {
  it("allows the admin by user id", () => {
    expect(mayUseReservedAuthor({ id: ADMIN_USER_IDS[0], email: "other@example.com" })).toBe(true);
  });

  it("allows the curator bot by user id", () => {
    expect(mayUseReservedAuthor({ id: CURATOR_BOT_USER_ID })).toBe(true);
  });

  it("denies another account carrying the curator bot's email", () => {
    expect(mayUseReservedAuthor({ id: "someone", email: "Vibes-Bot@vibetrends.dk" })).toBe(false);
  });

  it("denies everyone else", () => {
    expect(mayUseReservedAuthor({ id: "someone", email: "someone@example.com" })).toBe(false);
    expect(mayUseReservedAuthor({ id: "anon" })).toBe(false);
  });
});

describe("contentWriteErrorFrom", () => {
  it("recognizes the DB reserved_author and rate_limited errors", () => {
    expect(contentWriteErrorFrom({ code: "22023", message: "reserved_author" })?.kind).toBe("reserved_author");
    expect(contentWriteErrorFrom({ code: "P0001", message: "rate_limited" })?.kind).toBe("rate_limited");
  });

  it("ignores anything else", () => {
    expect(contentWriteErrorFrom({ code: "23505", message: "duplicate key" })).toBeNull();
    expect(contentWriteErrorFrom({ code: "P0001", message: "something else" })).toBeNull();
    expect(contentWriteErrorFrom(null)).toBeNull();
  });
});
