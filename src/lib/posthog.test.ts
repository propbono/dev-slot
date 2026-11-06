import { beforeEach, describe, expect, it, vi } from "vitest";

const node = vi.hoisted(() => ({
  capture: vi.fn(),
  flush: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock("posthog-node", () => ({ PostHog: node.ctor }));

type PosthogHelper = typeof import("./posthog");

// Load a fresh copy of the helper with a specific (mocked) server key so we can
// exercise both the no-op and live paths against the same source.
async function loadHelper(apiKey: string): Promise<PosthogHelper> {
  vi.resetModules();
  vi.doMock("astro:env/server", () => ({
    POSTHOG_API_KEY: apiKey,
    POSTHOG_API_HOST: "https://us.i.posthog.com",
  }));
  return import("./posthog");
}

beforeEach(() => {
  vi.clearAllMocks();
  // `PostHog` is constructed with `new`, so the mock must be a regular
  // function (an arrow function is not a constructor).
  node.ctor.mockImplementation(function () {
    return { capture: node.capture, flush: node.flush };
  });
});

describe("posthog server helper", () => {
  it("no-ops when POSTHOG_API_KEY is unset", async () => {
    const { captureEvent, flush } = await loadHelper("");

    captureEvent({ distinctId: "u1", event: "sign_up", properties: { method: "password" } });
    await flush();

    expect(node.ctor).not.toHaveBeenCalled();
    expect(node.capture).not.toHaveBeenCalled();
  });

  it("skips flushing when no client exists", async () => {
    const { flush } = await loadHelper("");

    await flush();

    expect(node.ctor).not.toHaveBeenCalled();
    expect(node.flush).not.toHaveBeenCalled();
  });

  it("reports whether analytics is enabled", async () => {
    const disabled = await loadHelper("");
    const enabled = await loadHelper("phc_test_key");

    expect(disabled.isPostHogEnabled()).toBe(false);
    expect(enabled.isPostHogEnabled()).toBe(true);
  });

  it("swallows capture failures so analytics cannot break the user flow", async () => {
    const { captureEvent } = await loadHelper("phc_test_key");
    node.capture.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(() => {
      captureEvent({ distinctId: "u1", event: "sign_up", properties: {} });
    }).not.toThrow();
  });

  it("swallows flush failures so analytics cannot break the user flow", async () => {
    const { captureEvent, flush } = await loadHelper("phc_test_key");
    node.flush.mockRejectedValueOnce(new Error("network down"));

    captureEvent({ distinctId: "u1", event: "sign_up", properties: {} });
    await expect(flush()).resolves.toBeUndefined();
  });

  it("constructs the client with the host and flushes captured events", async () => {
    const { captureEvent, flush } = await loadHelper("phc_test_key");

    captureEvent({
      distinctId: "user-123",
      event: "sign_up",
      properties: { method: "password", requires_email_confirmation: true },
    });
    await flush();

    expect(node.ctor).toHaveBeenCalledWith("phc_test_key", { host: "https://us.i.posthog.com" });
    expect(node.capture).toHaveBeenCalledWith({
      distinctId: "user-123",
      event: "sign_up",
      properties: { method: "password", requires_email_confirmation: true },
    });
    expect(node.flush).toHaveBeenCalledTimes(1);
  });
});
