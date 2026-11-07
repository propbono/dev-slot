import { describe, expect, it } from "vitest";
import { featuresFor, PLAN_CARDS, planFor, planState } from "./plans";

describe("PLAN_CARDS", () => {
  it("lists the three sellable plans in order", () => {
    expect(PLAN_CARDS.map((p) => p.tier)).toEqual(["user", "pro", "unlimited"]);
  });

  it("keeps price points in sync with src/lib/stripe.ts", () => {
    expect(planFor("pro").price).toBe("CA$10");
    expect(planFor("unlimited").price).toBe("CA$15");
  });
});

describe("planState", () => {
  it("treats signed-out visitors as available", () => {
    expect(planState(null, "user")).toBe("available");
    expect(planState(null, "pro")).toBe("available");
    expect(planState(null, "unlimited")).toBe("available");
  });

  it("marks the user's current tier as current", () => {
    expect(planState("user", "user")).toBe("current");
    expect(planState("pro", "pro")).toBe("current");
    expect(planState("unlimited", "unlimited")).toBe("current");
  });

  it("allows upgrading to a higher tier", () => {
    expect(planState("user", "pro")).toBe("upgrade");
    expect(planState("user", "unlimited")).toBe("upgrade");
    expect(planState("pro", "unlimited")).toBe("upgrade");
  });

  it("blocks downgrading to a lower tier", () => {
    expect(planState("pro", "user")).toBe("downgrade");
    expect(planState("unlimited", "user")).toBe("downgrade");
    expect(planState("unlimited", "pro")).toBe("downgrade");
  });

  it("treats admin as unlimited for display", () => {
    expect(planState("admin", "unlimited")).toBe("current");
    expect(planState("admin", "pro")).toBe("downgrade");
    expect(planState("admin", "user")).toBe("downgrade");
  });
});

describe("featuresFor", () => {
  it("returns the feature list for each sellable tier", () => {
    expect(featuresFor("user")).toContain("1 interview per month");
    expect(featuresFor("pro")).toContain("5 interviews per month");
    expect(featuresFor("unlimited")).toContain("Unlimited interviews");
  });

  it("falls back to unlimited features for admin", () => {
    expect(featuresFor("admin")).toEqual(featuresFor("unlimited"));
  });
});
