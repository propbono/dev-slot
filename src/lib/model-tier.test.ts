import { describe, it, expect, vi } from "vitest";

vi.mock("astro:env/server", () => ({
  MODEL_FREE: "custom-free",
  MODEL_PRO: "custom-pro",
  MODEL_UNLIMITED: "custom-unlimited",
}));

import { TIER_MODEL_SLOT, resolveModel } from "./model-tier";

describe("TIER_MODEL_SLOT", () => {
  it("maps each role to its quality-class slot", () => {
    expect(TIER_MODEL_SLOT).toEqual({
      user: "free",
      pro: "pro",
      unlimited: "unlimited",
      admin: "unlimited",
    });
  });
});

describe("resolveModel", () => {
  it("resolves each role to its env-configured model id", () => {
    expect(resolveModel("user")).toBe("custom-free");
    expect(resolveModel("pro")).toBe("custom-pro");
    expect(resolveModel("unlimited")).toBe("custom-unlimited");
    expect(resolveModel("admin")).toBe("custom-unlimited");
  });

  it("defaults to the free slot for missing or unknown roles", () => {
    expect(resolveModel()).toBe("custom-free");
    expect(resolveModel(undefined)).toBe("custom-free");
    expect(resolveModel(null)).toBe("custom-free");
    expect(resolveModel("bogus")).toBe("custom-free");
  });
});
