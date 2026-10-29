import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

import { recordAnalyticsEvent } from "../analyticsEvents";

const sendBeacon = vi.fn((_url: string, _body: string) => true);
const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response(null, { status: 204 })));
vi.stubGlobal("navigator", { sendBeacon });
vi.stubGlobal("fetch", fetchMock);

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
  vi.unstubAllGlobals();
});

const argsOf = (call: number) =>
  JSON.parse(sendBeacon.mock.calls[call][1]) as Record<string, unknown>;

describe("recordAnalyticsEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it("beacons the mapped payload to /api/events", () => {
    recordAnalyticsEvent("copy_install", {
      itemType: "skill",
      itemSlug: "jobnet-search",
      hostSlug: "universal",
      snippet: "install",
    });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/events");
    const args = argsOf(0);
    expect(args.name).toBe("copy_install");
    expect(args.itemType).toBe("skill");
    expect(args.itemSlug).toBe("jobnet-search");
    expect(args.hostSlug).toBe("universal");
    expect(args.snippet).toBe("install");
    expect(args.sessionId).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses one session id across events in the same tab", () => {
    recordAnalyticsEvent("copy_install", { itemSlug: "a" });
    recordAnalyticsEvent("copy_install", { itemSlug: "b" });
    expect(argsOf(0).sessionId).toBe(argsOf(1).sessionId);
  });

  it("omits absent fields rather than sending nulls the route would reject", () => {
    recordAnalyticsEvent("copy_install");
    expect(argsOf(0)).toEqual({ name: "copy_install", sessionId: expect.any(String) });
  });

  it("falls back to fetch with keepalive when the beacon is refused", () => {
    sendBeacon.mockReturnValueOnce(false);
    recordAnalyticsEvent("connect_view", { itemSlug: "x" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string).name).toBe("connect_view");
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
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(argsOf(0).sessionId).toBeUndefined();

    Object.defineProperty(globalThis, "sessionStorage", {
      value: storageStub, configurable: true, writable: true,
    });
  });

  it("never throws when sending fails, so copying still works", () => {
    sendBeacon.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    expect(() => recordAnalyticsEvent("copy_install", { itemSlug: "x" })).not.toThrow();
  });
});
