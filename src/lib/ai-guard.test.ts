import { beforeEach, describe, expect, it } from "vitest";
import {
  decideAiCall,
  guardAiCall,
  resetInMemoryLimiters,
  SlidingWindow,
  type AiLimits,
  type Supabase,
} from "./ai-guard";

const TEST_LIMITS: AiLimits = {
  windowSeconds: 60,
  perUser: 10,
  perIp: 1000,
  globalPerWindow: 1000,
  dailyPerUser: 100,
  monthlyPerUser: 500,
};

beforeEach(() => {
  resetInMemoryLimiters(TEST_LIMITS);
});

/** Minimal fake Supabase: count queries return counts[callIndex], insert records the row. */
function makeSupabase(
  counts: number[],
  opts: { insertError?: unknown; countErrors?: Array<unknown | null> } = {},
) {
  let callIndex = 0;
  const inserted: unknown[] = [];
  const supabase = {
    from: (table: string) => {
      if (table !== "ai_usage_log") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            gte: () => {
              const count = counts[callIndex] ?? 0;
              const error = opts.countErrors?.[callIndex] ?? null;
              callIndex += 1;
              return Promise.resolve({ count, error });
            },
          }),
        }),
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ error: opts.insertError ?? null });
        },
      };
    },
  };
  return { supabase: supabase as unknown as Supabase, inserted };
}

describe("decideAiCall", () => {
  it("allows under all limits", () => {
    expect(decideAiCall({ window: 1, daily: 1, monthly: 1 }, TEST_LIMITS)).toEqual({ allowed: true });
  });

  it("allows exactly at each limit (reservation is inclusive)", () => {
    expect(decideAiCall({ window: 10, daily: 100, monthly: 500 }, TEST_LIMITS)).toEqual({ allowed: true });
  });

  it("blocks on per-user window", () => {
    expect(decideAiCall({ window: 11, daily: 0, monthly: 0 }, TEST_LIMITS)).toEqual({
      allowed: false,
      reason: "rate_limited",
    });
  });

  it("blocks on daily ceiling", () => {
    expect(decideAiCall({ window: 0, daily: 101, monthly: 0 }, TEST_LIMITS)).toEqual({
      allowed: false,
      reason: "daily_limit",
    });
  });

  it("blocks on monthly ceiling", () => {
    expect(decideAiCall({ window: 0, daily: 0, monthly: 501 }, TEST_LIMITS)).toEqual({
      allowed: false,
      reason: "monthly_limit",
    });
  });
});

describe("SlidingWindow", () => {
  it("allows up to max then blocks", () => {
    const window = new SlidingWindow(60_000, 2);
    expect(window.allow(1000)).toBe(true);
    expect(window.allow(1001)).toBe(true);
    expect(window.allow(1002)).toBe(false);
  });
});

describe("guardAiCall", () => {
  it("allows and logs a call when under limits", async () => {
    const { supabase, inserted } = makeSupabase([0, 0, 0]);
    const result = await guardAiCall(supabase, { userId: "u1", ip: "1.2.3.4", operation: "evaluate" }, TEST_LIMITS);
    expect(result).toEqual({ allowed: true });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ user_id: "u1", ip: "1.2.3.4", operation: "evaluate" });
  });

  it("blocks on per-user rate limit once the reservation exceeds the window", async () => {
    const { supabase, inserted } = makeSupabase([11, 0, 0]);
    const result = await guardAiCall(supabase, { userId: "u1", operation: "evaluate" }, TEST_LIMITS);
    expect(result).toEqual({ allowed: false, reason: "rate_limited" });
    expect(inserted).toHaveLength(1);
  });

  it("fails closed when the audit insert errors", async () => {
    const { supabase } = makeSupabase([0, 0, 0], { insertError: new Error("insert failed") });
    const result = await guardAiCall(supabase, { userId: "u1", operation: "evaluate" }, TEST_LIMITS);
    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("fails closed when the usage count query errors", async () => {
    const { supabase } = makeSupabase([0, 0, 0], { countErrors: [new Error("count failed"), null, null] });
    const result = await guardAiCall(supabase, { userId: "u1", operation: "evaluate" }, TEST_LIMITS);
    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });
});
