import { describe, it, expect, vi } from "vitest";

// Test the tier limit logic by examining the internal TIERS object
// and verifying exported functions with mocked Supabase client

describe("tiers", () => {
  const makeSupabase = (overrides: Record<string, unknown> = {}) => {
    const _chain: Record<string, unknown> = {};
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                role: "user",
                interviews_this_month: 0,
                billing_cycle_start: new Date().toISOString(),
                ...overrides,
              },
              error: null,
            }),
          }),
        }),
      }),
    };
  };

  it("Free tier with 0 interviews allows new session", async () => {
    const supabase = makeSupabase({ role: "user", interviews_this_month: 0 });
    const { checkInterviewLimit } = await import("./tiers");
    const result = await checkInterviewLimit(supabase as never, "user-1");
    expect(result.allowed).toBe(true);
  });

  it("Free tier with 1 interview blocks new session", async () => {
    const supabase = makeSupabase({ role: "user", interviews_this_month: 1 });
    const { checkInterviewLimit } = await import("./tiers");
    const result = await checkInterviewLimit(supabase as never, "user-1");
    expect(result.allowed).toBe(false);
    expect(result.message).toBe("upgrade_required");
  });

  it("Pro tier with 4 interviews allows, 5 blocks", async () => {
    const supabase4 = makeSupabase({ role: "pro", interviews_this_month: 4 });
    const { checkInterviewLimit } = await import("./tiers");
    const r1 = await checkInterviewLimit(supabase4 as never, "user-1");
    expect(r1.allowed).toBe(true);

    const supabase5 = makeSupabase({ role: "pro", interviews_this_month: 5 });
    const r2 = await checkInterviewLimit(supabase5 as never, "user-1");
    expect(r2.allowed).toBe(false);
  });

  it("Unlimited tier always allows", async () => {
    const supabase = makeSupabase({ role: "unlimited", interviews_this_month: 999 });
    const { checkInterviewLimit } = await import("./tiers");
    const result = await checkInterviewLimit(supabase as never, "user-1");
    expect(result.allowed).toBe(true);
  });

  it("Admin tier always allows", async () => {
    const supabase = makeSupabase({ role: "admin", interviews_this_month: 999 });
    const { checkInterviewLimit } = await import("./tiers");
    const result = await checkInterviewLimit(supabase as never, "user-1");
    expect(result.allowed).toBe(true);
  });
});

describe("getRole and tier metadata", () => {
  const makeRoleSupabase = (data: unknown, error: unknown = null) => {
    const single = vi.fn().mockResolvedValue({ data, error });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    return { from };
  };

  it("returns the persisted role", async () => {
    const supabase = makeRoleSupabase({ role: "pro" });
    const { getRole } = await import("./tiers");
    await expect(getRole(supabase as never, "user-1")).resolves.toBe("pro");
  });

  it("defaults to the free tier when the role row is missing", async () => {
    const supabase = makeRoleSupabase(null, { code: "PGRST116" });
    const { getRole } = await import("./tiers");
    await expect(getRole(supabase as never, "user-1")).resolves.toBe("user");
  });

  it("exposes human-readable labels and an upgrade ordering", async () => {
    const { TIER_LABELS, TIER_RANK } = await import("./tiers");
    expect(TIER_LABELS).toEqual({ user: "Free", pro: "Pro", unlimited: "Unlimited", admin: "Admin" });
    expect(TIER_RANK.user).toBeLessThan(TIER_RANK.pro);
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.unlimited);
    expect(TIER_RANK.unlimited).toBeLessThan(TIER_RANK.admin);
  });
});
