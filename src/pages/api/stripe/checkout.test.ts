import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSessionsCreate } = vi.hoisted(() => ({ mockSessionsCreate: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

vi.mock("stripe", () => ({
  default: function Stripe() {
    return { checkout: { sessions: { create: mockSessionsCreate } } };
  },
}));

import { POST } from "./checkout";
import { createClient } from "@/lib/supabase";

function mockSupabaseUser(user: { id: string; email?: string } | null) {
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: () => Promise.resolve({ data: { user } }) },
  } as never);
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
});
