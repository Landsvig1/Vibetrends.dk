import { describe, it, expect } from "vitest";
import { isAdminUser, ADMIN_USER_IDS } from "../permissions";

const ADMIN_ID = ADMIN_USER_IDS[0];
const OTHER_ID = "00000000-0000-4000-8000-000000000001";

describe("isAdminUser", () => {
  it("is true for a listed user id", () => {
    expect(isAdminUser({ id: ADMIN_ID })).toBe(true);
  });

  it("ignores client-set metadata that claims the admin handle", () => {
    expect(
      isAdminUser({
        id: OTHER_ID,
        user_metadata: { user_name: "landsvig1", full_name: "landsvig1" },
      } as { id: string })
    ).toBe(false);
  });

  it("ignores the admin email on another account", () => {
    expect(isAdminUser({ id: OTHER_ID, email: "kasper@landsvig.com" } as { id: string })).toBe(false);
  });

  it("is false for no user", () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });
});
