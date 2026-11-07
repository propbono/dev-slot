import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPortalCreate, mockCaptureException, mockCaptureMessage } = vi.hoisted(() => ({
  mockPortalCreate: vi.fn(),
  mockCaptureException: vi.fn(),
  mockCaptureMessage: vi.fn(),
}));

vi.mock("@sentry/astro", () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}));

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

vi.mock("stripe", () => ({
  default: function Stripe() {
    return {
      billingPortal: { sessions: { create: mockPortalCreate } },
    };
  },
}));

import { POST } from "./portal";
import { createClient } from "@/lib/supabase";

function makeSupabase(user: { id: string } | null, roleRow: unknown = null, roleError: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: roleRow, error: roleError });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { auth: { getUser: () => Promise.resolve({ data: { user } }) }, from };
}

function makeContext() {
  return {
    request: { headers: new Headers() },
    cookies: {},
    url: new URL("http://localhost:3000/api/stripe/portal"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("portal.ts (Stripe Customer Portal session creation)", () => {
  it("rejects unauthenticated requests before creating a session", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as never);

    const res = await POST(makeContext() as never);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("creates a portal session for the stored customer and returns its URL", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: "user-1" }, { stripe_customer_id: "cus_123" }) as never);
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" });

    const res = await POST(makeContext() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://billing.stripe.com/session/xyz" });
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:3000/account",
    });
  });

  it("returns no_subscription when the user has no Stripe customer id", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: "user-1" }, null, { code: "PGRST116" }) as never);

    const res = await POST(makeContext() as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "no_subscription",
      detail: "You don't have an active subscription to manage.",
    });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns a clean error when the portal session cannot be created", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: "user-1" }, { stripe_customer_id: "cus_123" }) as never);
    mockPortalCreate.mockRejectedValue(new Error("no portal config"));

    const res = await POST(makeContext() as never);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "portal_error", detail: "no portal config" });
    expect(mockCaptureException).toHaveBeenCalledWith(new Error("no portal config"), {
      tags: { route: "stripe/portal" },
    });
    expect(mockPortalCreate).toHaveBeenCalled();
  });

  it("returns a 503 when the user_roles read fails instead of treating it as no customer", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ id: "user-1" }, null, { code: "connection_error" }) as never,
    );

    const res = await POST(makeContext() as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "portal_error", detail: "connection_error" });
    expect(mockCaptureException).toHaveBeenCalledWith(new Error("connection_error"), {
      tags: { route: "stripe/portal" },
    });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });
});
