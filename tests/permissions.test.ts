import { describe, it, expect } from "bun:test";
import { isAdministrator, checkIsAdmin } from "../src/services/permissions.ts";

describe("Permissions Service - Administrator Check", () => {
  it("identifies administrator bit in standard discord bitfield string", () => {
    expect(isAdministrator("8")).toBe(true);
    expect(isAdministrator("24")).toBe(true);
    expect(isAdministrator("1099511627775")).toBe(true);
  });

  it("returns false for regular users without admin permissions", () => {
    expect(isAdministrator("2048")).toBe(false);
    expect(isAdministrator("0")).toBe(false);
    expect(isAdministrator(0)).toBe(false);
  });

  it("handles undefined, null, or invalid input gracefully", () => {
    expect(isAdministrator(undefined)).toBe(false);
    expect(isAdministrator("")).toBe(false);
    expect(isAdministrator("invalid_string")).toBe(false);
  });

  it("approves admin when user id is in adminUserIds list", async () => {
    const isAdmin = await checkIsAdmin({
      userId: "123456789",
      adminUserIds: "999, 123456789 , 888",
    });
    expect(isAdmin).toBe(true);
  });

  it("rejects non-admin when user id is not in adminUserIds and lacks permission", async () => {
    const isAdmin = await checkIsAdmin({
      userId: "111111111",
      adminUserIds: "999, 123456789",
      permissions: "0",
    });
    expect(isAdmin).toBe(false);
  });
});
