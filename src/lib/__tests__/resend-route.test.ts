import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: mockCreateClient,
  CONFIRM_EMAIL_PATH: "/auth/confirm-email",
}));

import { POST } from "@/pages/api/auth/resend";

function makeContext(email: string | null) {
  const formData = new FormData();
  if (email !== null) formData.append("email", email);
  return {
    request: {
      headers: new Headers(),
      formData: () => Promise.resolve(formData),
    },
    cookies: {},
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  };
}

function makeSupabase(resendError: unknown = null) {
  return {
    auth: {
      resend: vi.fn().mockResolvedValue({ error: resendError }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resend.ts (confirmation email resend endpoint)", () => {
  it("redirects with an error when Supabase is not configured", async () => {
    mockCreateClient.mockReturnValue(null);

    const res = await POST(makeContext("a@b.com") as never);

    expect(res.headers.get("Location")).toBe(
      `/auth/confirm-email?error=${encodeURIComponent("Supabase is not configured")}`,
    );
  });

  it("redirects with an error when the email is missing", async () => {
    mockCreateClient.mockReturnValue(makeSupabase());

    const res = await POST(makeContext(null) as never);

    expect(res.headers.get("Location")).toContain(encodeURIComponent("Enter your email address"));
  });

  it("resends the confirmation email and redirects with the resent flag", async () => {
    const supabase = makeSupabase();
    mockCreateClient.mockReturnValue(supabase);

    const res = await POST(makeContext("a@b.com") as never);

    expect(supabase.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.com" });
    expect(res.headers.get("Location")).toBe(`/auth/confirm-email?resent=1&email=${encodeURIComponent("a@b.com")}`);
  });

  it("surfaces the Supabase resend error", async () => {
    mockCreateClient.mockReturnValue(makeSupabase({ message: "User already confirmed" }));

    const res = await POST(makeContext("a@b.com") as never);

    expect(res.headers.get("Location")).toContain(encodeURIComponent("User already confirmed"));
  });
});
