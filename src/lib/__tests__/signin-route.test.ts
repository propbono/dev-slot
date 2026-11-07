import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockIsEmailConfirmed, mockCaptureEvent, mockFlush } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockIsEmailConfirmed: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockFlush: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: mockCreateClient,
  isEmailConfirmed: mockIsEmailConfirmed,
  CONFIRM_EMAIL_PATH: "/auth/confirm-email",
}));

vi.mock("@/lib/posthog", () => ({
  captureEvent: mockCaptureEvent,
  flush: mockFlush,
}));

import { POST } from "@/pages/api/auth/signin";

function makeContext(email = "a@b.com", password = "hunter22") {
  const formData = new FormData();
  formData.append("email", email);
  formData.append("password", password);
  return {
    request: {
      headers: new Headers(),
      formData: () => Promise.resolve(formData),
    },
    cookies: {},
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  };
}

function makeSupabase(
  overrides: {
    signIn?: ReturnType<typeof vi.fn>;
    signOut?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    auth: {
      signInWithPassword: overrides.signIn ?? vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: overrides.signOut ?? vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signin.ts (email-confirmation enforcement)", () => {
  it("redirects with an error when Supabase is not configured", async () => {
    mockCreateClient.mockReturnValue(null);

    const res = await POST(makeContext() as never);

    expect(res.headers.get("Location")).toBe(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  });

  it("routes email_not_confirmed errors to the confirmation screen", async () => {
    mockCreateClient.mockReturnValue(
      makeSupabase({
        signIn: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { code: "email_not_confirmed", message: "Email not confirmed" },
        }),
      }),
    );

    const res = await POST(makeContext() as never);

    expect(res.headers.get("Location")).toBe(`/auth/confirm-email?email=${encodeURIComponent("a@b.com")}`);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("signs out and redirects when a password sign-in yields an unconfirmed user", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mockCreateClient.mockReturnValue(
      makeSupabase({
        signIn: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "a@b.com" } },
          error: null,
        }),
        signOut,
      }),
    );
    mockIsEmailConfirmed.mockReturnValue(false);

    const res = await POST(makeContext() as never);

    expect(mockIsEmailConfirmed).toHaveBeenCalledWith({ id: "user-1", email: "a@b.com" });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("Location")).toBe(`/auth/confirm-email?email=${encodeURIComponent("a@b.com")}`);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("signs in confirmed users and records the login event", async () => {
    mockCreateClient.mockReturnValue(
      makeSupabase({
        signIn: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
          error: null,
        }),
      }),
    );
    mockIsEmailConfirmed.mockReturnValue(true);

    const res = await POST(makeContext() as never);

    expect(res.headers.get("Location")).toBe("/new-session");
    expect(mockCaptureEvent).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "login",
      properties: { method: "password" },
    });
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });
});
