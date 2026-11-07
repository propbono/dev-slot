import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

const { mockCreateClient, mockIsEmailConfirmed } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockIsEmailConfirmed: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: mockCreateClient,
  isEmailConfirmed: mockIsEmailConfirmed,
  CONFIRM_EMAIL_PATH: "/auth/confirm-email",
}));

vi.mock("astro:middleware", () => ({
  defineMiddleware: (fn: unknown) => fn,
}));

import { onRequest } from "./middleware";

type UserLike = { id: string; email_confirmed_at?: string | null } | null;

function makeContext(pathname: string): APIContext {
  const locals: Record<string, unknown> = {};
  return {
    request: { headers: new Headers() },
    cookies: {},
    locals,
    url: new URL(`http://localhost${pathname}`),
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
}

function makeSupabase(user: UserLike) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user } }) },
  };
}

const next = () => Promise.resolve(new Response("ok", { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("middleware (email-confirmation enforcement)", () => {
  it("redirects unauthenticated visitors away from protected routes", async () => {
    mockCreateClient.mockReturnValue(makeSupabase(null));

    const ctx = makeContext("/new-session");
    const res = (await onRequest(ctx, next)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location") as string).toBe("/auth/signin");
  });

  it("redirects unconfirmed users from /new-session to the confirm screen", async () => {
    mockCreateClient.mockReturnValue(makeSupabase({ id: "user-1" }));
    mockIsEmailConfirmed.mockReturnValue(false);

    const ctx = makeContext("/new-session");
    const res = (await onRequest(ctx, next)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location") as string).toBe("/auth/confirm-email");
  });

  it("redirects unconfirmed users from /interview pages to the confirm screen", async () => {
    mockCreateClient.mockReturnValue(makeSupabase({ id: "user-1" }));
    mockIsEmailConfirmed.mockReturnValue(false);

    const ctx = makeContext("/interview/some-session");
    const res = (await onRequest(ctx, next)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location") as string).toBe("/auth/confirm-email");
  });

  it("lets confirmed users through protected routes", async () => {
    mockCreateClient.mockReturnValue(makeSupabase({ id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" }));
    mockIsEmailConfirmed.mockReturnValue(true);

    const ctx = makeContext("/new-session");
    const res = (await onRequest(ctx, next)) as Response;

    expect(res.status).toBe(200);
    expect(ctx.locals.user).toEqual({
      id: "user-1",
      email_confirmed_at: "2024-01-01T00:00:00Z",
    });
  });

  it("does not redirect on public routes", async () => {
    mockCreateClient.mockReturnValue(null);

    const ctx = makeContext("/auth/confirm-email");
    const res = (await onRequest(ctx, next)) as Response;

    expect(res.status).toBe(200);
  });
});
