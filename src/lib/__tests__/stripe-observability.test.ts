import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Focused test for the Stripe error-observability change: every checkout /
// webhook failure branch must (1) capture to Sentry with a static `route` tag
// and nothing but the error message (never secrets/PII), and (2) return an
// actionable `detail` field naming the cause while keeping HTTP status codes
// unchanged. `@sentry/astro` is mocked so we can assert exactly what gets
// captured.
// ---------------------------------------------------------------------------

const {
  mockCaptureException,
  mockCaptureMessage,
  mockSessionsCreate,
  mockSubscriptionsRetrieve,
  mockSubscriptionsUpdate,
  mockVerifyWebhook,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockCaptureMessage: vi.fn(),
  mockSessionsCreate: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
  mockVerifyWebhook: vi.fn(),
}));

vi.mock("@sentry/astro", () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  isPlanTier: (value: unknown) => value === "pro" || value === "unlimited",
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  toError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
  getPriceId: (tier: string) => (tier === "pro" ? "test-price-pro" : "test-price-unlimited"),
  getStripe: () => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    subscriptions: { retrieve: mockSubscriptionsRetrieve, update: mockSubscriptionsUpdate },
  }),
  verifyWebhook: (...args: unknown[]) => mockVerifyWebhook(...args),
  PLANS: {
    pro: { name: "Archdrill Pro", unitAmount: 1000 },
    unlimited: { name: "Archdrill Unlimited", unitAmount: 1500 },
  },
}));

import { POST as checkoutPOST } from "@/pages/api/stripe/checkout";
import { POST as webhookPOST } from "@/pages/api/stripe/webhook";
import { createClient, createServiceClient } from "@/lib/supabase";

// --- helpers ---------------------------------------------------------------

function makeCheckoutSupabase(
  user: { id: string; email?: string } | null,
  roleRow: unknown = { stripe_subscription_id: "sub_123" },
  roleError: unknown = null,
) {
  const single = vi.fn().mockResolvedValue({ data: roleRow, error: roleError });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });

  const insert = vi.fn().mockResolvedValue({ error: null });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq: deleteEq });

  const claimSelect = vi.fn().mockResolvedValue({ data: null, error: null });
  const claimLt = vi.fn().mockReturnValue({ select: claimSelect });
  const claimEq = vi.fn().mockReturnValue({ lt: claimLt });
  const claimUpdate = vi.fn().mockReturnValue({ eq: claimEq });

  const from = vi.fn((table: string) =>
    table === "checkout_inflight" ? { insert, delete: del, update: claimUpdate } : { select },
  );

  return { auth: { getUser: () => Promise.resolve({ data: { user } }) }, from };
}

function makeServiceSupabase(upsertError: unknown = null) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertError });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq: deleteEq });
  const from = vi.fn().mockReturnValue({ upsert, update, delete: del });
  return { from, upsert };
}

function checkoutContext(body: unknown) {
  return {
    request: { headers: new Headers(), json: () => Promise.resolve(body) },
    cookies: {},
    url: new URL("http://localhost:3000/api/stripe/checkout"),
  };
}

function webhookContext(signature: string | null, payload: string) {
  return {
    request: {
      headers: new Headers(signature ? { "stripe-signature": signature } : undefined),
      text: () => Promise.resolve(payload),
    },
    cookies: {},
    url: new URL("http://localhost:3000/api/stripe/webhook"),
  };
}

const completedEvent = () => ({
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

const SECRETS = ["test-stripe-secret", "test-webhook-secret", "test-service-role", "test-key", "sk_test", "cus_"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkout.ts — Sentry capture + actionable detail", () => {
  it("captures not_configured to Sentry and names the missing env var (status 503)", async () => {
    vi.mocked(createClient).mockReturnValue(null as never);

    const res = await checkoutPOST(checkoutContext({ tier: "pro" }) as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "not_configured",
      detail: "SUPABASE_URL/KEY is not set",
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith("stripe/checkout: SUPABASE_URL/KEY is not set", {
      level: "error",
      tags: { route: "stripe/checkout" },
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("captures the underlying error for a failed subscription retrieve (status 502)", async () => {
    vi.mocked(createClient).mockReturnValue(makeCheckoutSupabase({ id: "user-1", email: "a@b.com" }) as never);
    mockSubscriptionsRetrieve.mockRejectedValue(new Error("resource_missing"));

    const res = await checkoutPOST(checkoutContext({ tier: "pro" }) as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "subscription_error", detail: "resource_missing" });
    expect(mockCaptureException).toHaveBeenCalledWith(new Error("resource_missing"), {
      tags: { route: "stripe/checkout" },
    });
  });

  it("captures the underlying error for a failed Checkout Session create (status 502)", async () => {
    // No stored subscription (PGRST116 = missing role row) → fresh checkout path.
    vi.mocked(createClient).mockReturnValue(
      makeCheckoutSupabase({ id: "user-1", email: "a@b.com" }, null, { code: "PGRST116" }) as never,
    );
    mockSessionsCreate.mockRejectedValue(new Error("network"));

    const res = await checkoutPOST(checkoutContext({ tier: "pro" }) as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "checkout_error", detail: "network" });
    expect(mockCaptureException).toHaveBeenCalledWith(new Error("network"), { tags: { route: "stripe/checkout" } });
  });

  it("never sends secrets or PII to Sentry or in the JSON detail", async () => {
    vi.mocked(createClient).mockReturnValue(makeCheckoutSupabase({ id: "user-1", email: "a@b.com" }) as never);
    mockSubscriptionsRetrieve.mockRejectedValue(new Error("resource_missing"));

    const res = await checkoutPOST(checkoutContext({ tier: "pro" }) as never);
    const body = (await res.json()) as { detail: string };

    const captured = JSON.stringify(mockCaptureException.mock.calls) + JSON.stringify(mockCaptureMessage.mock.calls);
    for (const secret of SECRETS) {
      expect(captured).not.toContain(secret);
      expect(body.detail).not.toContain(secret);
    }
    expect(body.detail).toBe("resource_missing");
  });
});

describe("webhook.ts — Sentry capture + actionable detail", () => {
  it("captures not_configured for a missing service role client (status 503)", async () => {
    mockVerifyWebhook.mockReturnValue({ ok: true, event: completedEvent().event });
    vi.mocked(createServiceClient).mockReturnValue(null as never);

    const res = await webhookPOST(webhookContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "not_configured",
      detail: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY is not set",
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "stripe/webhook: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY is not set",
      { level: "error", tags: { route: "stripe/webhook" } },
    );
  });

  it("captures the underlying Supabase error for a failed role upsert (status 500)", async () => {
    mockVerifyWebhook.mockReturnValue(completedEvent());
    vi.mocked(createServiceClient).mockReturnValue(
      makeServiceSupabase(new Error("db down")) as never,
    );

    const res = await webhookPOST(webhookContext("t=1,v1=good", "{}") as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "db_error", detail: "db down" });
    expect(mockCaptureException).toHaveBeenCalledWith(new Error("db down"), { tags: { route: "stripe/webhook" } });
  });

  it("captures invalid_signature at warning level with the verification detail (status 400)", async () => {
    mockVerifyWebhook.mockReturnValue({
      ok: false,
      error: "invalid_signature",
      detail: "Webhook signature verification failed: signature mismatch",
    });

    const res = await webhookPOST(webhookContext("t=1,v1=bad", "{}") as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "invalid_signature",
      detail: "Webhook signature verification failed: signature mismatch",
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "stripe/webhook: Webhook signature verification failed: signature mismatch",
      { level: "warning", tags: { route: "stripe/webhook" } },
    );
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});
