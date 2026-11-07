import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSessionsCreate, mockSubscriptionsRetrieve, mockSubscriptionsUpdate } = vi.hoisted(() => ({
  mockSessionsCreate: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
  isEmailConfirmed: (user: { email_confirmed_at?: string; confirmed_at?: string } | null | undefined) =>
    Boolean(user?.email_confirmed_at ?? user?.confirmed_at),
}));

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

type ClaimConfig = {
  insertError?: unknown;
  reclaimData?: unknown[] | null;
  reclaimError?: unknown;
};

function makeSupabase(
  user: { id: string; email?: string; email_confirmed_at?: string | null } | null,
  roleRow: unknown = null,
  roleError: unknown = null,
  claim: ClaimConfig = {},
) {
  const authenticatedUser = user ? { email_confirmed_at: "2024-01-01T00:00:00Z", ...user } : null;
  const single = vi.fn().mockResolvedValue({ data: roleRow, error: roleError });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });

  const insert = vi.fn().mockResolvedValue({ error: claim.insertError ?? null });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq: deleteEq });

  const claimUpdateSelect = vi.fn().mockResolvedValue({
    data: claim.reclaimData ?? null,
    error: claim.reclaimError ?? null,
  });
  const claimLt = vi.fn().mockReturnValue({ select: claimUpdateSelect });
  const claimUpdateEq = vi.fn().mockReturnValue({ lt: claimLt });
  const claimUpdate = vi.fn().mockReturnValue({ eq: claimUpdateEq });

  const from = vi.fn((table: string) => {
    if (table === "checkout_inflight") {
      return { insert, delete: del, update: claimUpdate };
    }
    return { select };
  });

  return {
    auth: { getUser: () => Promise.resolve({ data: { user: authenticatedUser } }) },
    from,
    insert,
    delete: del,
    claimUpdate,
    claimUpdateEq,
    claimLt,
  };
}

function mockSupabaseUser(
  user: { id: string; email?: string; email_confirmed_at?: string | null } | null,
  roleRow: unknown = null,
  roleError: unknown = null,
  claim: ClaimConfig = {},
) {
  vi.mocked(createClient).mockReturnValue(makeSupabase(user, roleRow, roleError, claim) as never);
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

  it("rejects unconfirmed users before creating a session", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com", email_confirmed_at: null });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "email_not_confirmed" });
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
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      {
        mode: "subscription",
        client_reference_id: "user-1",
        customer_email: "a@b.com",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "cad",
              unit_amount: 1000,
              recurring: { interval: "month" },
              product_data: { name: "Archdrill Pro" },
            },
          },
        ],
        success_url: "http://localhost:3000/account?checkout=success",
        cancel_url: "http://localhost:3000/account?checkout=cancelled",
        metadata: { tier: "pro", userId: "user-1" },
        subscription_data: { metadata: { tier: "pro" } },
      },
      { idempotencyKey: expect.stringMatching(/^user-1:[0-9a-f-]{36}$/) },
    );
  });

  it("prices the unlimited tier at CA$15/mo", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test_unlimited" });

    await POST(makeContext({ tier: "unlimited" }) as never);

    const args = mockSessionsCreate.mock.calls[0][0] as {
      line_items: { price_data: { unit_amount: number; product_data: { name: string } } }[];
      metadata: { tier: string };
    };
    expect(args.line_items[0].price_data.unit_amount).toBe(1500);
    expect(args.line_items[0].price_data.product_data.name).toBe("Archdrill Unlimited");
    expect(args.metadata.tier).toBe("unlimited");
    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: expect.stringMatching(/^user-1:[0-9a-f-]{36}$/),
    });
  });

  it("keys Stripe idempotency per user with a per-attempt nonce so tiers never collide", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test" });

    await POST(makeContext({ tier: "pro" }) as never);
    await POST(makeContext({ tier: "unlimited" }) as never);

    const firstKey = (mockSessionsCreate.mock.calls[0][1] as { idempotencyKey: string }).idempotencyKey;
    const secondKey = (mockSessionsCreate.mock.calls[1][1] as { idempotencyKey: string }).idempotencyKey;

    expect(firstKey).toMatch(/^user-1:[0-9a-f-]{36}$/);
    expect(secondKey).toMatch(/^user-1:[0-9a-f-]{36}$/);
    expect(firstKey).not.toBe(secondKey);
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
    await expect(res.json()).resolves.toEqual({ error: "subscription_error", detail: "resource_missing" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns a clean error when the plan change update fails", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, { stripe_subscription_id: "sub_123" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "active", items: { data: [{ id: "si_123" }] } });
    mockSubscriptionsUpdate.mockRejectedValue(new Error("network"));

    const res = await POST(makeContext({ tier: "unlimited" }) as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "subscription_error", detail: "network" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns a clean error when Checkout Session creation fails", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" });
    mockSessionsCreate.mockRejectedValue(new Error("network"));

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "checkout_error", detail: "network" });
  });

  it("releases the checkout claim when Checkout Session creation fails", async () => {
    const supabase = makeSupabase({ id: "user-1", email: "a@b.com" });
    vi.mocked(createClient).mockReturnValue(supabase as never);
    mockSessionsCreate.mockRejectedValue(new Error("network"));

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(502);
    expect(supabase.delete).toHaveBeenCalled();
  });

  it("returns a 503 when the user_roles read fails instead of treating it as no subscription", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, null, { code: "connection_error" });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "subscription_error", detail: "connection_error" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("treats a missing user_roles row (PGRST116) as no subscription", async () => {
    mockSupabaseUser({ id: "user-1", email: "a@b.com" }, null, { code: "PGRST116" });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test_pro" });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(200);
    expect(mockSessionsCreate).toHaveBeenCalled();
  });

  it("returns 409 when a concurrent checkout is already in flight", async () => {
    mockSupabaseUser(
      { id: "user-1", email: "a@b.com" },
      null,
      { code: "PGRST116" },
      { insertError: { code: "23505" }, reclaimData: [] },
    );

    const res = await POST(makeContext({ tier: "unlimited" }) as never);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "checkout_in_flight" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("reclaims a stale checkout claim and creates the session", async () => {
    mockSupabaseUser(
      { id: "user-1", email: "a@b.com" },
      null,
      { code: "PGRST116" },
      { insertError: { code: "23505" }, reclaimData: [{ user_id: "user-1" }] },
    );
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test_pro" });

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(200);
    expect(mockSessionsCreate).toHaveBeenCalled();
  });

  it("fails closed when a stale claim was just reclaimed by a concurrent request", async () => {
    const supabase = makeSupabase(
      { id: "user-1", email: "a@b.com" },
      null,
      { code: "PGRST116" },
      { insertError: { code: "23505" }, reclaimData: [] },
    );
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "checkout_in_flight" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(supabase.delete).not.toHaveBeenCalled();
    expect(supabase.claimUpdate).toHaveBeenCalledWith({ tier: "pro", claimed_at: expect.any(String) });
    expect(supabase.claimUpdateEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.claimLt).toHaveBeenCalledWith("claimed_at", expect.any(String));
  });

  it("returns 503 when the checkout claim insert fails for a non-conflict reason", async () => {
    mockSupabaseUser(
      { id: "user-1", email: "a@b.com" },
      null,
      { code: "PGRST116" },
      { insertError: { code: "connection_error" } },
    );

    const res = await POST(makeContext({ tier: "pro" }) as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "checkout_error", detail: "connection_error" });
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });
});
