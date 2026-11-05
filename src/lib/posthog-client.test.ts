import { describe, expect, it, vi } from "vitest";

const init = vi.hoisted(() => vi.fn());

vi.mock("posthog-js", () => ({ default: { init } }));

import { initPostHog } from "./posthog-client";

describe("posthog-client browser snippet", () => {
  it("initializes with the approved privacy posture", () => {
    initPostHog("phc_test_key", "https://us.i.posthog.com");

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith("phc_test_key", {
      api_host: "https://us.i.posthog.com",
      capture_pageview: true,
      autocapture: false,
      cookieless_mode: "always",
      disable_session_recording: true,
    });
  });

  it("honors a custom host", () => {
    initPostHog("phc_test_key", "https://eu.i.posthog.com");

    expect(init).toHaveBeenLastCalledWith(
      "phc_test_key",
      expect.objectContaining({ api_host: "https://eu.i.posthog.com" }),
    );
  });
});
