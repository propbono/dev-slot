import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createServiceClient: vi.fn() }));

const mockVerifyWebhook = vi.fn();
vi.mock("@/lib/stripe", () => ({
  verifyWebhook: (...args: unknown[]) => mockVerifyWebhook(...args),
  isPlanTier: (value: unknown) => value === "pro" || value === "unlimited",
}));

import { POST } from "./webhook";
import { createServiceClient } from "@/lib/supabase";

type FakeServiceSupabase = {
  from: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
};

function makeServiceSupabase(overrides: { upsertError?: unknown; updateError?: unknown } = {}): FakeServiceSupabase {
  const upsert = vi.fn().mockResolvedValue({ error: overrides.upsertError ?? null });
  const eq = vi.fn().mockResolvedValue({ error: overrides.updateError ?? null });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ upsert, update });
  return { from, upsert, update, eq };
}

function makeContext(signature: string | null, payload: string) {
  return {
    request: {
      headers: new Headers(signature ? { "stripe-signature": signature } : undefined),
      text: () => Promise.resolve(payload),
    },
    cookies: {},
    url: new URL("http://localhost:3000/api/stripe/webhook"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhook.ts (Stripe webhook handler)", () => {
  it("rejects an unverified signature without touching the database", async () => {
    mockVerifyWebhook.mockReturnValue({ ok: false, error: "invalid_signature" });

    const res = await POST(makeContext("t=1,v1=bad", "{}") as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("grants the purchased tier on checkout.session.completed", async () => {
    const supabase = makeServiceSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockVerifyWebhook.mockReturnValue({
      ok: true,
      event: {
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "user-1",
            customer: "cus_123",
            subscription: "sub_123",
            metadata: { tier: "pro" },
          },
        },
      },
    });

    const res = await POST(makeContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(200);
    expect(supabase.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", role: "pro", stripe_customer_id: "cus_123", stripe_subscription_id: "sub_123" },
      { onConflict: "user_id" },
    );
  });

  it("returns 500 when the role upsert fails so Stripe retries", async () => {
    const supabase = makeServiceSupabase({ upsertError: new Error("db down") });
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockVerifyWebhook.mockReturnValue({
      ok: true,
      event: {
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "user-1",
            customer: "cus_123",
            subscription: "sub_123",
            metadata: { tier: "pro" },
          },
        },
      },
    });

    const res = await POST(makeContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "db_error" });
  });

  it("reverts to the free tier on customer.subscription.deleted", async () => {
    const supabase = makeServiceSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockVerifyWebhook.mockReturnValue({
      ok: true,
      event: {
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_123", customer: "cus_123" } },
      },
    });

    const res = await POST(makeContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(200);
    expect(supabase.update).toHaveBeenCalledWith({ role: "user" });
    expect(supabase.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_123");
  });

  it("reverts to the free tier when a subscription is canceled via update", async () => {
    const supabase = makeServiceSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockVerifyWebhook.mockReturnValue({
      ok: true,
      event: {
        type: "customer.subscription.updated",
        data: { object: { id: "sub_123", customer: "cus_123", status: "canceled" } },
      },
    });

    await POST(makeContext("t=1,v1=good", "{}") as never);

    expect(supabase.update).toHaveBeenCalledWith({ role: "user" });
    expect(supabase.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_123");
  });

  it("propagates a plan change from subscription metadata on update", async () => {
    const supabase = makeServiceSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockVerifyWebhook.mockReturnValue({
      ok: true,
      event: {
        type: "customer.subscription.updated",
        data: {
          object: { id: "sub_123", customer: "cus_123", status: "active", metadata: { tier: "unlimited" } },
        },
      },
    });

    const res = await POST(makeContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(200);
    expect(supabase.update).toHaveBeenCalledWith({ role: "unlimited" });
    expect(supabase.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_123");
  });

  it("leaves non-terminal updates with no tier metadata untouched", async () => {
    const supabase = makeServiceSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockVerifyWebhook.mockReturnValue({
      ok: true,
      event: {
        type: "customer.subscription.updated",
        data: { object: { id: "sub_123", customer: "cus_123", status: "active" } },
      },
    });

    const res = await POST(makeContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(200);
    expect(supabase.update).not.toHaveBeenCalled();
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it("returns 500 when a downgrade write fails so Stripe retries", async () => {
    const supabase = makeServiceSupabase({ updateError: new Error("db down") });
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockVerifyWebhook.mockReturnValue({
      ok: true,
      event: {
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_123", customer: "cus_123" } },
      },
    });

    const res = await POST(makeContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "db_error" });
  });
});
