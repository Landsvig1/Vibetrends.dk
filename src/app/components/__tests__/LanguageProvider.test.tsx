/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { LanguageProvider } from "../LanguageProvider";
import { translations } from "@/lib/translations";

const mockState = "da";
const setLanguageStateMock = vi.fn();
const useCallbackSpy = vi.fn((fn, _deps) => fn);
const useMemoSpy = vi.fn((fn, _deps) => fn());

let useStateCallCount = 0;
const useStateSpy = vi.fn((init) => {
  useStateCallCount++;
  if (useStateCallCount === 1) {
    return [mockState, setLanguageStateMock];
  }
  return [init, vi.fn()];
});

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (init: any) => useStateSpy(init),
    useCallback: (fn: any, deps: any) => useCallbackSpy(fn, deps),
    useMemo: (fn: any, deps: any) => useMemoSpy(fn, deps),
  };
});

describe("LanguageProvider - Referential Stability", () => {
  it("should wrap t and setLanguage in useCallback, and wrap contextValue in useMemo with correct dependencies", () => {
    useStateCallCount = 0;
    useStateSpy.mockClear();
    useCallbackSpy.mockClear();
    useMemoSpy.mockClear();

    const children = React.createElement("div", null, "Test");
    LanguageProvider({ children, initialLanguage: "da" });

    // Verify hooks were called
    expect(useStateSpy).toHaveBeenCalled();

    // Verify setLanguage useCallback call (1st hook call of useCallback)
    expect(useCallbackSpy).toHaveBeenNthCalledWith(1, expect.any(Function), [mockState]);

    // Verify t useCallback call (2nd hook call of useCallback)
    expect(useCallbackSpy).toHaveBeenNthCalledWith(2, expect.any(Function), [mockState]);

    // Verify useMemo call for the contextValue
    expect(useMemoSpy).toHaveBeenCalledWith(expect.any(Function), [
      mockState,
      expect.any(Function), // setLanguage callback
      expect.any(Function), // t callback
    ]);

    // Verify translation behavior of t
    const tFunc = useCallbackSpy.mock.calls[1][0] as (key: any) => string;
    expect(tFunc("blog.loading")).toBe(translations.da["blog.loading"]);
  });
});
