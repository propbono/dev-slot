import { describe, it, expect, vi, beforeAll } from "vitest";

const { initMock, requestDataIntegrationMock, captureConsoleIntegrationMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  requestDataIntegrationMock: vi.fn(() => ({ name: "RequestData" })),
  captureConsoleIntegrationMock: vi.fn(() => ({ name: "CaptureConsole" })),
}));

vi.mock("@sentry/astro", () => ({
  init: initMock,
  requestDataIntegration: requestDataIntegrationMock,
  captureConsoleIntegration: captureConsoleIntegrationMock,
}));

// Evaluate server config first, then client config. initMock.call order is
// deterministic: [0] = server, [1] = client.
await import("../../sentry.server.config");
await import("../../sentry.client.config");

const serverInit = () => initMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
const clientInit = () => initMock.mock.calls[1]?.[0] as Record<string, unknown> | undefined;

describe("sentry.server.config", () => {
  beforeAll(() => {
    expect(initMock).toHaveBeenCalledTimes(2);
  });

  it("disables all default PII data collection", () => {
    expect(serverInit()?.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      stackFrameVariables: false,
    });
  });

  it("allowlists only url + query_string in request data", () => {
    expect(requestDataIntegrationMock).toHaveBeenCalledWith({
      include: {
        cookies: false,
        data: false,
        headers: false,
        ip: false,
        query_string: true,
        url: true,
      },
    });
  });

  it("captures only error-level console output", () => {
    expect(captureConsoleIntegrationMock).toHaveBeenCalledWith({ levels: ["error"] });
  });

  it("beforeSend strips request data, cookies, and headers", () => {
    const beforeSend = (serverInit() as { beforeSend: (e: unknown) => unknown } | undefined)?.beforeSend;
    expect(typeof beforeSend).toBe("function");

    const event = {
      request: {
        data: { answer: "candidate secret" },
        cookies: { session: "token" },
        headers: { authorization: "Bearer x" },
        url: "/api/interview/evaluate",
      },
    };
    const result = beforeSend?.(event) as { request: Record<string, unknown> };

    expect(result.request).not.toHaveProperty("data");
    expect(result.request).not.toHaveProperty("cookies");
    expect(result.request).not.toHaveProperty("headers");
    expect(result.request).toHaveProperty("url", "/api/interview/evaluate");
  });
});

describe("sentry.client.config", () => {
  it("keeps Session Replay OFF", () => {
    expect(clientInit()?.replaysSessionSampleRate).toBe(0);
    expect(clientInit()?.replaysOnErrorSampleRate).toBe(0);
  });
});
