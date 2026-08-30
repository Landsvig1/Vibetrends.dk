import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn(() => ({ then: (ok: () => void) => { ok(); return undefined; } }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseBrowserClient: () => ({ rpc }),
}));

import { recordAnalyticsEvent } from "../analyticsEvents";

describe("recordAnalyticsEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("calls the record_analytics_event RPC with the mapped payload", () => {
    recordAnalyticsEvent("copy_install", {
      itemType: "skill",
      itemSlug: "jobnet-search",
      hostSlug: "universal",
      snippet: "install",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("record_analytics_event");
    expect(args.p_event_name).toBe("copy_install");
    expect(args.p_item_slug).toBe("jobnet-search");
    expect(args.p_host_slug).toBe("universal");
    expect(args.p_snippet).toBe("install");
    expect(args.p_session_id).toBeTruthy();
  });

  it("reuses one session id across events in the same tab", () => {
    recordAnalyticsEvent("copy_install", { itemSlug: "a" });
    recordAnalyticsEvent("copy_install", { itemSlug: "b" });
    const first = (rpc.mock.calls[0] as never as [string, Record<string, string>])[1].p_session_id;
    const second = (rpc.mock.calls[1] as never as [string, Record<string, string>])[1].p_session_id;
    expect(first).toBe(second);
  });

  it("sends nulls rather than undefined for absent fields", () => {
    recordAnalyticsEvent("copy_install");
    const args = (rpc.mock.calls[0] as never as [string, Record<string, unknown>])[1];
    expect(args.p_item_slug).toBeNull();
    expect(args.p_item_type).toBeNull();
    expect(args.p_host_slug).toBeNull();
  });

  it("never throws when the RPC rejects, so copying still works", () => {
    rpc.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    expect(() => recordAnalyticsEvent("copy_install", { itemSlug: "x" })).not.toThrow();
  });
});
