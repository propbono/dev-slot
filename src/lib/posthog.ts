import { PostHog } from "posthog-node";
import { POSTHOG_API_HOST, POSTHOG_API_KEY } from "astro:env/server";

/**
 * Server-side PostHog helper. The whole module is a silent no-op when
 * `POSTHOG_API_KEY` is unset, so the app builds, runs, and stays testable
 * without a PostHog account (mirrors `src/lib/config-status.ts`'s guard).
 *
 * Privacy constraints: only enum/boolean/number properties are allowed. Never
 * pass email, job descriptions, answers, challenge text, IPs, or query-string
 * URLs here.
 */
export type AnalyticsProperties = Record<string, string | number | boolean>;

export type AnalyticsEvent = {
  distinctId: string;
  event: string;
  properties?: AnalyticsProperties;
};

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!POSTHOG_API_KEY) return null;
  client ??= new PostHog(POSTHOG_API_KEY, { host: POSTHOG_API_HOST });
  return client;
}

/**
 * Fire an event with the user's Supabase auth UUID as `distinctId`. `capture`
 * is fire-and-forget; call `flush()` before the route returns so Vercel
 * freezing the lambda does not drop the event.
 */
export function captureEvent({ distinctId, event, properties }: AnalyticsEvent): void {
  getClient()?.capture({ distinctId, event, properties });
}

/**
 * Flush queued events. Must be awaited before each API route returns
 * (serverless may freeze immediately after the response). No-op when unset.
 */
export async function flush(): Promise<void> {
  const c = getClient();
  if (c) {
    await c.flush();
  }
}
