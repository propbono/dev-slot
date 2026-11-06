import * as Sentry from "@sentry/astro";
import {
  AI_DAILY_CALL_LIMIT,
  AI_GLOBAL_RATE_LIMIT_PER_WINDOW,
  AI_MONTHLY_CALL_LIMIT,
  AI_RATE_LIMIT_PER_IP,
  AI_RATE_LIMIT_PER_USER,
  AI_RATE_LIMIT_WINDOW_SECONDS,
} from "astro:env/server";
import type { createClient } from "./supabase";

export type Supabase = NonNullable<ReturnType<typeof createClient>>;

export type AiLimits = {
  windowSeconds: number;
  perUser: number;
  perIp: number;
  globalPerWindow: number;
  dailyPerUser: number;
  monthlyPerUser: number;
};

export type AiGuardReason = "rate_limited" | "daily_limit" | "monthly_limit" | "internal_error";

export type AiGuardResult = { allowed: true } | { allowed: false; reason: AiGuardReason };

export type AiGuardParams = {
  userId: string;
  ip?: string;
  operation: string;
};

/** Read the AI protection knobs from environment, applying sensible defaults. */
export function getAiLimits(): AiLimits {
  return {
    windowSeconds: AI_RATE_LIMIT_WINDOW_SECONDS,
    perUser: AI_RATE_LIMIT_PER_USER,
    perIp: AI_RATE_LIMIT_PER_IP,
    globalPerWindow: AI_GLOBAL_RATE_LIMIT_PER_WINDOW,
    dailyPerUser: AI_DAILY_CALL_LIMIT,
    monthlyPerUser: AI_MONTHLY_CALL_LIMIT,
  };
}

/**
 * Fixed-size sliding window limiter. Best-effort: state lives in the current
 * serverless instance's memory, so it throttles bursts hitting one instance
 * rather than providing a durable cross-instance guarantee.
 */
export class SlidingWindow {
  private hits: number[] = [];

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  allow(now: number = Date.now()): boolean {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}

/**
 * Pure decision over per-user counters. The counts already include the current
 * (just-reserved) call, so a call is only rejected when the reservation would
 * push the count past the configured limit.
 */
export function decideAiCall(
  counts: { window: number; daily: number; monthly: number },
  limits: AiLimits,
): AiGuardResult {
  if (counts.window > limits.perUser) return { allowed: false, reason: "rate_limited" };
  if (counts.daily > limits.dailyPerUser) return { allowed: false, reason: "daily_limit" };
  if (counts.monthly > limits.monthlyPerUser) return { allowed: false, reason: "monthly_limit" };
  return { allowed: true };
}

// Module-level in-memory limiters (per-IP + global). Resettable for tests.
let activeLimits: AiLimits = getAiLimits();
let ipWindow = new SlidingWindow(activeLimits.windowSeconds * 1000, activeLimits.perIp);
let globalWindow = new SlidingWindow(activeLimits.windowSeconds * 1000, activeLimits.globalPerWindow);

export function resetInMemoryLimiters(limits: AiLimits = getAiLimits()): void {
  activeLimits = limits;
  ipWindow = new SlidingWindow(limits.windowSeconds * 1000, limits.perIp);
  globalWindow = new SlidingWindow(limits.windowSeconds * 1000, limits.globalPerWindow);
}

async function countSince(supabase: Supabase, userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Enforce rate limits + spend ceilings before an AI call and reserve an audit
 * row. Must be called with an authenticated user's id; the caller is
 * responsible for authenticating the request (no anonymous path may reach this
 * function).
 */
export async function guardAiCall(
  supabase: Supabase,
  params: AiGuardParams,
  limits: AiLimits = activeLimits,
): Promise<AiGuardResult> {
  const { userId, ip, operation } = params;

  // In-memory best-effort limits first — reject fast without touching the DB.
  if (ip && !ipWindow.allow()) return { allowed: false, reason: "rate_limited" };
  if (!globalWindow.allow()) return { allowed: false, reason: "rate_limited" };

  // Durable per-user limits from the usage log. Insert the audit row first so
  // the limit is a hard cap: concurrent requests that all reserve before any
  // of them counts will see each other's rows and the excess ones fail closed
  // (over-rejection is safer than over-spend).
  const now = new Date();
  const { error: insertError } = await supabase.from("ai_usage_log").insert({
    user_id: userId,
    ip: ip ?? null,
    operation,
  });
  if (insertError) {
    Sentry.captureException(insertError, { tags: { operation, guardStage: "insert" } });
    return { allowed: false, reason: "internal_error" };
  }

  const windowStart = new Date(now.getTime() - limits.windowSeconds * 1000);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const [windowCount, dailyCount, monthlyCount] = await Promise.all([
      countSince(supabase, userId, windowStart.toISOString()),
      countSince(supabase, userId, dayStart.toISOString()),
      countSince(supabase, userId, monthStart.toISOString()),
    ]);

    return decideAiCall({ window: windowCount, daily: dailyCount, monthly: monthlyCount }, limits);
  } catch (err) {
    Sentry.captureException(err, { tags: { operation, guardStage: "count" } });
    return { allowed: false, reason: "internal_error" };
  }
}
