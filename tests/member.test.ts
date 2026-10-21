import { describe, it, expect } from "bun:test";
import { validateAndNormalizeName } from "../src/services/member.ts";

describe("Member Service - Name Validation & Normalization", () => {
  it("normalizes 'First Last' into 'First L.'", () => {
    const res = validateAndNormalizeName("Jane Doe");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("Jane D.");
  });

  it("handles names already ending in an initial like 'Alex K.'", () => {
    const res = validateAndNormalizeName("Alex K.");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("Alex K.");
  });

  it("handles names with just initial without period 'Alex K'", () => {
    const res = validateAndNormalizeName("Alex K");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("Alex K.");
  });

  it("handles lowercase initial by capitalizing", () => {
    const res = validateAndNormalizeName("alex k");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("alex K.");
  });

  it("handles hyphenated first names", () => {
    const res = validateAndNormalizeName("Mary-Jane Watson");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("Mary-Jane W.");
  });

  it("handles multiple spaces and trims properly", () => {
    const res = validateAndNormalizeName("   John    Smith   ");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("John S.");
  });

  it("fails when only a single name is provided", () => {
    const res = validateAndNormalizeName("Madonna");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("first name and last initial");
  });

  it("fails when input is empty or whitespace", () => {
    const res = validateAndNormalizeName("    ");
    expect(res.valid).toBe(false);
    expect(res.error).toBe("Name cannot be empty.");
  });

  it("fails when normalized name exceeds 32 characters", () => {
    const longName = "A".repeat(35) + " B";
    const res = validateAndNormalizeName(longName);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("max 32 characters");
  });
});
