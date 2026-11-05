import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSessionsCreate, mockSubscriptionsRetrieve, mockSubscriptionsUpdate } = vi.hoisted(() => ({
  mockSessionsCreate: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

vi.mock("stripe", () => ({
  default: function Stripe() {
    return {
      checkout: { sessions: { create: mockSessionsCreate } },
      subscriptions: { retrieve: mockSubscriptionsRetrieve, update: mockSubscriptionsUpdate },
    };
  },
}));

import { POST } from "./checkout";
import { createClient } from "@/lib/supabase";

function makeSupabase(user: { id: string; email?: string } | null, roleRow: unknown = null, roleError: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: roleRow, error: roleError });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    auth: { getUser: () => Promise.resolve({ data: { user } }) },
    from,
  };
}

function mockSupabaseUser(
  user: { id: string; email?: string } | null,
  roleRow: unknown = null,
  roleError: unknown = null,
) {
  vi.mocked(createClient).mockReturnValue(makeSupabase(user, roleRow, roleError) as never);
}

function makeContext(body: unknown) {
  return {
    request: {
      headers: new Headers(),
      json: () => Promise.resolve(body),
    },
    cookies: {},
    url: new URL("http://localhost:3000/api/stripe/checkout"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkout.ts (Stripe Checkout session creation)", () => {
  it("rejects unauthenticated requests before creating a session", async () => {
    mockSupabaseUser(null);

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects an invalid tier", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" });

    const res = await POST(makeContext({ tier: "admin" }) as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_tier" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a subscription session for pro and returns the checkout URL", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test_pro" });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://checkout.stripe.com/c/pay/test_pro" });
    expect(mockSessionsCreate).toHaveBeenCalledWith({
      mode: "subscription",
      client_reference_id: "user-1",
      customer_email: "a@b.com",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 1000,
            recurring: { interval: "month" },
            product_data: { name: "DevSlot Pro" },
          },
        },
      ],
      success_url: "http://localhost:3000/new-session?checkout=success",
      cancel_url: "http://localhost:3000/new-session?checkout=cancelled",
      metadata: { tier: "pro", userId: "user-1" },
      subscription_data: { metadata: { tier: "pro" } },
    });
  });

  it("prices the unlimited tier at $15/mo", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test_unlimited" });

    await POST(makeContext({ tier: "unlimited" }) as never);

    const args = mockSessionsCreate.mock.calls[0][0] as {
      line_items: { price_data: { unit_amount: number; product_data: { name: string } } }[];
      metadata: { tier: string };
    };
    expect(args.line_items[0].price_data.unit_amount).toBe(1500);
    expect(args.line_items[0].price_data.product_data.name).toBe("DevSlot Unlimited");
    expect(args.metadata.tier).toBe("unlimited");
  });

  it("updates the existing subscription instead of creating a second one", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, { stripe_subscription_id: "sub_123" });
    mockSubscriptionsRetrieve.mockResolvedValue({
      status: "active",
      items: { data: [{ id: "si_123" }] },
    });
    mockSubscriptionsUpdate.mockResolvedValue({ id: "sub_123" });

    const res = await POST(makeContext({ tier: "unlimited" }) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: null });
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_123", {
      items: [{ id: "si_123", price: "test-price-unlimited" }],
      proration_behavior: "create_prorations",
      metadata: { tier: "unlimited" },
    });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a fresh checkout when the stored subscription is no longer changeable", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, { stripe_subscription_id: "sub_old" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "canceled", items: { data: [{ id: "si_old" }] } });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test_pro" });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalled();
  });

  it("returns a clean error when retrieving the stored subscription fails", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, { stripe_subscription_id: "sub_stale" });
    mockSubscriptionsRetrieve.mockRejectedValue(new Error("resource_missing"));

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "subscription_error" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns a clean error when the plan change update fails", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, { stripe_subscription_id: "sub_123" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "active", items: { data: [{ id: "si_123" }] } });
    mockSubscriptionsUpdate.mockRejectedValue(new Error("network"));

    const res = await POST(makeContext({ tier: "unlimited" }) as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "subscription_error" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns a clean error when Checkout Session creation fails", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" });
    mockSessionsCreate.mockRejectedValue(new Error("network"));

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "checkout_error" });
  });

  it("returns a 503 when the user_roles read fails instead of treating it as no subscription", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, null, { code: "connection_error" });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "subscription_error" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("treats a missing user_roles row (PGRST116) as no subscription", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, null, { code: "PGRST116" });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test_pro" });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(200);
    expect(mockSessionsCreate).toHaveBeenCalled();
  });
});
