import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const rpc = vi.fn(() => ({ then: (ok: () => void) => { ok(); return undefined; } }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseBrowserClient: () => ({ rpc }),
}));

import { recordAnalyticsEvent } from "../analyticsEvents";

/**
 * The suite runs on `environment: "node"` with no jsdom, so sessionStorage is
 * not a global. Node 24 has none at all while Node 26 exposes one, which made
 * this file pass locally and fail in CI -- hence an explicit stub rather than
 * relying on whatever the runtime happens to provide.
 */
const store = new Map<string, string>();
const storageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
};

const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
Object.defineProperty(globalThis, "sessionStorage", {
  value: storageStub,
  configurable: true,
  writable: true,
});

afterAll(() => {
  if (originalDescriptor) Object.defineProperty(globalThis, "sessionStorage", originalDescriptor);
  else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

const argsOf = (call: number) =>
  (rpc.mock.calls[call] as unknown as [string, Record<string, unknown>])[1];

describe("recordAnalyticsEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it("calls the record_analytics_event RPC with the mapped payload", () => {
    recordAnalyticsEvent("copy_install", {
      itemType: "skill",
      itemSlug: "jobnet-search",
      hostSlug: "universal",
      snippet: "install",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn] = rpc.mock.calls[0] as unknown as [string];
    expect(fn).toBe("record_analytics_event");
    const args = argsOf(0);
    expect(args.p_event_name).toBe("copy_install");
    expect(args.p_item_slug).toBe("jobnet-search");
    expect(args.p_host_slug).toBe("universal");
    expect(args.p_snippet).toBe("install");
    expect(args.p_session_id).toBeTruthy();
  });

  it("reuses one session id across events in the same tab", () => {
    recordAnalyticsEvent("copy_install", { itemSlug: "a" });
    recordAnalyticsEvent("copy_install", { itemSlug: "b" });
    expect(argsOf(0).p_session_id).toBe(argsOf(1).p_session_id);
  });

  it("sends nulls rather than undefined for absent fields", () => {
    recordAnalyticsEvent("copy_install");
    const args = argsOf(0);
    expect(args.p_item_slug).toBeNull();
    expect(args.p_item_type).toBeNull();
    expect(args.p_host_slug).toBeNull();
  });

  it("still records the event when session storage is unavailable", () => {
    const throwing = {
      getItem: () => { throw new Error("storage disabled"); },
      setItem: () => { throw new Error("storage disabled"); },
      clear: () => {},
    };
    Object.defineProperty(globalThis, "sessionStorage", {
      value: throwing, configurable: true, writable: true,
    });

    expect(() => recordAnalyticsEvent("copy_install", { itemSlug: "x" })).not.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(argsOf(0).p_session_id).toBeNull();

    Object.defineProperty(globalThis, "sessionStorage", {
      value: storageStub, configurable: true, writable: true,
    });
  });

  it("never throws when the RPC itself fails, so copying still works", () => {
    rpc.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    expect(() => recordAnalyticsEvent("copy_install", { itemSlug: "x" })).not.toThrow();
  });
});
