import posthog from "posthog-js";

/**
 * Initialize the PostHog browser snippet once from `src/components/PostHog.astro`
 * (which is rendered from `src/layouts/Layout.astro`).
 *
 * Approved privacy posture: cookieless (no persistent cookie), no consent
 * banner, US cloud, no session recording, no autocapture.
 */
export function initPostHog(posthogKey: string, posthogHost: string): void {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: true,
    autocapture: false,
    // Cookieless: no cookies, no localStorage/sessionStorage. Identity is a
    // privacy-preserving hash computed on PostHog's servers. Requires the
    // project's "cookieless mode" setting to be enabled in PostHog.
    cookieless_mode: "always",
    // Interview screens contain the user's own answers + pasted job
    // descriptions, so never record sessions or capture form fields.
    disable_session_recording: true,
  });
}
