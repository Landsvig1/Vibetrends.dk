import { describe, it, expect } from "vitest";
import {
  REVIEW_STATES,
  isGateEnabled,
  reviewStateForWrite,
  visibleOnly,
  pendingSubmissionBody,
  type ReviewedTable,
} from "@/lib/reviewGate";

/** Minimal stand-in for a PostgREST builder — records what visibleOnly did. */
function fakeQuery() {
  const filters: [string, string][] = [];
  const q = {
    filters,
    eq(column: string, value: string) {
      filters.push([column, value]);
      return q;
    },
  };
  return q;
}

const GATED: ReviewedTable[] = ["skills", "vibes", "agents", "blog_posts"];
const UNGATED: ReviewedTable[] = ["forum_threads", "forum_replies"];

describe("reviewGate — which tables are gated", () => {
  it.each(GATED)("%s hides pending rows from public reads", (table) => {
    expect(isGateEnabled(table)).toBe(true);
  });

  // Not an incidental config value: gating the forum is self-sealing while it
  // has no activity (see FORUM_GATE_ENABLED). If someone flips it, this test
  // failing is the intended prompt to confirm that was deliberate.
  it.each(UNGATED)("%s ships with its gate OFF", (table) => {
    expect(isGateEnabled(table)).toBe(false);
  });
});

describe("reviewGate — what state a write lands in", () => {
  it.each(GATED)("%s holds an anonymous or untrusted bearer caller's submission", (table) => {
    expect(reviewStateForWrite(table, true)).toBe("pending");
    expect(reviewStateForWrite(table, { user: { id: "1", username: "agent", isAnonymous: true } })).toBe("pending");
    expect(reviewStateForWrite(table, { user: { id: "2", username: "other", email: "other@example.com" } })).toBe("pending");
  });

  it.each(GATED)("%s publishes a trusted curator bot's submission directly", (table) => {
    expect(reviewStateForWrite(table, { user: { id: "bot", username: "bot", email: "vibes-bot@vibetrends.dk" } })).toBe("approved");
    expect(reviewStateForWrite(table, { user: { id: "admin", username: "admin", email: "kasper@landsvig.com" } })).toBe("approved");
  });

  it.each(GATED)("%s publishes a cookie caller's submission directly", (table) => {
    expect(reviewStateForWrite(table, false)).toBe("approved");
    expect(reviewStateForWrite(table, undefined)).toBe("approved");
  });

  it.each(UNGATED)("%s publishes directly even for a bearer caller", (table) => {
    expect(reviewStateForWrite(table, true)).toBe("approved");
    expect(reviewStateForWrite(table, { user: { id: "1", username: "agent", isAnonymous: true } })).toBe("approved");
  });

  it("only ever returns a value the CHECK constraint accepts", () => {
    for (const table of [...GATED, ...UNGATED]) {
      for (const caller of [
        true,
        false,
        undefined,
        { user: { id: "1", username: "agent", isAnonymous: true } },
        { user: { id: "bot", username: "bot", email: "vibes-bot@vibetrends.dk" } },
      ]) {
        expect(REVIEW_STATES).toContain(reviewStateForWrite(table, caller));
      }
    }
  });
});

describe("visibleOnly", () => {
  it.each(GATED)("adds review_state = approved for %s", (table) => {
    const q = fakeQuery();
    visibleOnly(q, table);
    expect(q.filters).toEqual([["review_state", "approved"]]);
  });

  // The forum's reads must run byte-identical SQL to what they ran before this
  // shipped — a no-op, not a filter that happens to match everything.
  it.each(UNGATED)("adds no filter for %s", (table) => {
    const q = fakeQuery();
    visibleOnly(q, table);
    expect(q.filters).toEqual([]);
  });

  it("returns the same builder so it can be chained", () => {
    const q = fakeQuery();
    expect(visibleOnly(q, "skills")).toBe(q);
    expect(visibleOnly(q, "forum_threads")).toBe(q);
  });
});

describe("pendingSubmissionBody", () => {
  it("carries the id so a caller can correlate the eventual publication", () => {
    expect(pendingSubmissionBody("s_123")).toMatchObject({ status: "pending", id: "s_123" });
  });

  // The receipt replaces the entry in the 202 response. If it ever started
  // carrying content fields, an agent could mistake it for the created row.
  it("carries no content fields", () => {
    const body = pendingSubmissionBody("s_123");
    expect(Object.keys(body).sort()).toEqual(["id", "message", "moreInfo", "status"]);
  });
});
