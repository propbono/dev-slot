import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConstructEvent } = vi.hoisted(() => ({ mockConstructEvent: vi.fn() }));

vi.mock("stripe", () => ({
  default: {
    webhooks: { constructEvent: mockConstructEvent },
  },
}));

import { errorMessage, getPriceId, isPlanTier, PLANS, verifyWebhook } from "./stripe";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stripe lib", () => {
  it("locks the price points to CA$10 and CA$15", () => {
    expect(PLANS.pro).toEqual({ name: "Archdrill Pro", unitAmount: 1000 });
    expect(PLANS.unlimited).toEqual({ name: "Archdrill Unlimited", unitAmount: 1500 });
  });

  it("only accepts pro and unlimited as sellable tiers", () => {
    expect(isPlanTier("pro")).toBe(true);
    expect(isPlanTier("unlimited")).toBe(true);
    expect(isPlanTier("admin")).toBe(false);
    expect(isPlanTier("user")).toBe(false);
    expect(isPlanTier(undefined)).toBe(false);
  });

  it("resolves stable Price IDs for plan changes", () => {
    expect(getPriceId("pro")).toBe("test-price-pro");
    expect(getPriceId("unlimited")).toBe("test-price-unlimited");
  });

  describe("errorMessage", () => {
    it("redacts email addresses from an Error message", () => {
      expect(errorMessage(new Error("Invalid customer_email: user@example.com"))).toBe(
        "Invalid customer_email: [redacted]",
      );
    });

    it("redacts card-number-shaped digit runs as defense-in-depth", () => {
      expect(errorMessage("Card 4242424242424242 declined")).toBe("Card [redacted] declined");
    });

    it("passes ordinary messages through unchanged", () => {
      expect(errorMessage(new Error("resource_missing"))).toBe("resource_missing");
    });
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhook("payload", null)).toEqual({
      ok: false,
      error: "invalid_signature",
      detail: "Missing stripe-signature header",
    });
  });

  it("rejects a payload whose signature fails verification", () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    expect(verifyWebhook("payload", "sig")).toEqual({
      ok: false,
      error: "invalid_signature",
      detail: "Webhook signature verification failed: signature mismatch",
    });
  });

  it("returns the constructed event when the signature verifies", () => {
    const event = { id: "evt_1", type: "checkout.session.completed" };
    mockConstructEvent.mockReturnValue(event);

    expect(verifyWebhook("payload", "sig")).toEqual({ ok: true, event });
    expect(mockConstructEvent).toHaveBeenCalledWith("payload", "sig", "test-webhook-secret");
  });
});
