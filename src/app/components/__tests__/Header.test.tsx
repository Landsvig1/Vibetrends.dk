/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import Header from "../Header";

// Spy on useMemo and useState
const useMemoSpy = vi.fn<(fn: any, deps?: any) => any>((fn) => fn());
const useStateSpy = vi.fn<(init: any) => [any, any]>((init) => [init, vi.fn()]);

// Mock react
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (init: any) => useStateSpy(init),
    useMemo: (fn: any, deps: any) => useMemoSpy(fn, deps),
  };
});

// Mock hooks
const mockUsePathname = vi.fn(() => "/forum");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

const mockLogout = vi.fn();
vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: null,
    logout: mockLogout,
  }),
}));

const mockSetLanguage = vi.fn();
const mockT = vi.fn((key: string) => `translated_${key}`);
vi.mock("../LanguageProvider", () => ({
  useLanguage: () => ({
    language: "da",
    setLanguage: mockSetLanguage,
    t: mockT,
  }),
}));

describe("Header - Optimization and Memoization", () => {
  it("should memoize navItems with [t] as dependency and activeIdx with [navItems, pathname] as dependencies", () => {
    useMemoSpy.mockClear();
    useStateSpy.mockClear();
    mockT.mockClear();

    // Render/Call the Header function as a normal function for testing hook structure
    Header();

    // Verify useState was called twice (for mobileMenuOpen and loginModalOpen)
    expect(useStateSpy).toHaveBeenCalledTimes(2);

    // Find the useMemo call for navItems (dependency is [t])
    const navItemsCall = useMemoSpy.mock.calls.find(
      (call) => call[1] && call[1].length === 1 && call[1][0] === mockT
    );
    expect(navItemsCall).toBeDefined();

    // Find the useMemo call for activeIdx (dependency is [navItems, pathname])
    const activeIdxCall = useMemoSpy.mock.calls.find(
      (call) =>
        call[1] &&
        call[1].length === 2 &&
        Array.isArray(call[0]()) === false // activeIdx returns number, not array
    );
    expect(activeIdxCall).toBeDefined();
    // Verify the pathname "/forum" is in the dependencies
    expect(activeIdxCall![1]).toContain("/forum");

    // Let's run a timing test to assert that it is extremely fast and efficient
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      Header();
    }
    const end = performance.now();
    const duration = end - start;
    // 200 calls should execute within 250ms in normal sandbox environments
    expect(duration).toBeLessThan(250);
  });
});
