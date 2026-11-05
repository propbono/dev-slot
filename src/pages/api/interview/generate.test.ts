import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  extractConstraints: vi.fn(),
  generateChallenge: vi.fn(),
}));
vi.mock("@/lib/ai-guard", () => ({ guardAiCall: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn(), flush: vi.fn() }));

import { GET } from "./generate";
import { createClient } from "@/lib/supabase";
import { extractConstraints, generateChallenge } from "@/lib/ai";
import { guardAiCall } from "@/lib/ai-guard";
import { captureEvent, flush } from "@/lib/posthog";

type FakeSupabaseOptions = {
  user: { id: string } | null;
  session?: Record<string, unknown> | null;
  activeChallenge?: Record<string, unknown> | null;
  genMsgs?: Record<string, unknown>[];
  systemMsgs?: Record<string, unknown>[];
  markerId?: string;
};

/** Minimal fluent Supabase fake exercising only what generate.ts uses. */
function makeFakeSupabase(opts: FakeSupabaseOptions) {
  let sessionMessagesSelectCalls = 0;

  const selectChain = (result: { data?: unknown; error?: unknown }) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve, reject),
    };
    return chain;
  };

  const writeChain = () => {
    const chain = {
      eq: () => chain,
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve({ error: null }).then(resolve, reject),
    };
    return chain;
  };

  return {
    auth: { getUser: () => ({ data: { user: opts.user } }) },
    from: (table: string) => ({
      select: () => {
        if (table === "sessions") return selectChain({ data: opts.session ?? null });
        if (table === "challenges") return selectChain({ data: opts.activeChallenge ?? null });
        if (table === "session_messages") {
          const call = sessionMessagesSelectCalls++;
          if (call === 0) return selectChain({ data: opts.genMsgs ?? [] });
          return selectChain({ data: opts.systemMsgs ?? [] });
        }
        return selectChain({ data: null });
      },
      insert: () => ({
        select: () => ({
          single: () => ({ data: { id: opts.markerId ?? "marker-1" }, error: null }),
        }),
      }),
      update: () => writeChain(),
      delete: () => writeChain(),
    }),
  };
}

function makeContext(sessionId: string) {
  return {
    request: { headers: new Headers() },
    cookies: {},
    url: new URL(`http://localhost/api/interview/generate?sessionId=${sessionId}`),
    clientAddress: "203.0.113.7",
  };
}

const JD =
  "We are hiring a senior backend engineer for a fintech platform. You will design distributed systems, work with PostgreSQL and Kafka, and own reliability. Strong system design fundamentals required. This is a long enough job description to pass validation.";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generate.ts (challenge generation AI endpoint)", () => {
  it("rejects unauthenticated requests before any AI call", async () => {
    const supabase = makeFakeSupabase({ user: null });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await GET(makeContext("s1") as never);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ready: false, error: "unauthorized" });
    expect(guardAiCall).not.toHaveBeenCalled();
    expect(extractConstraints).not.toHaveBeenCalled();
    expect(generateChallenge).not.toHaveBeenCalled();
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("blocks the model call and returns 429 when the guard rejects", async () => {
    const supabase = makeFakeSupabase({
      user: { id: "user-1" },
      session: { id: "s1", status: "created" },
      activeChallenge: { id: "c1" },
      genMsgs: [],
      systemMsgs: [{ content: JSON.stringify({ raw_jd: JD, mode: "jd" }) }],
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);
    vi.mocked(guardAiCall).mockResolvedValue({ allowed: false, reason: "rate_limited" });

    const res = await GET(makeContext("s1") as never);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({ ready: false, error: "rate_limited" });
    expect(guardAiCall).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      ip: "203.0.113.7",
      operation: "extract",
    });
    expect(extractConstraints).not.toHaveBeenCalled();
    expect(generateChallenge).not.toHaveBeenCalled();
  });

  it("guards both extract and generate calls and produces the challenge when allowed", async () => {
    const supabase = makeFakeSupabase({
      user: { id: "user-1" },
      session: { id: "s1", status: "created" },
      activeChallenge: { id: "c1" },
      genMsgs: [],
      systemMsgs: [{ content: JSON.stringify({ raw_jd: JD, mode: "jd" }) }],
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);
    vi.mocked(guardAiCall).mockResolvedValue({ allowed: true });
    vi.mocked(extractConstraints).mockResolvedValue({
      tech_stack: ["PostgreSQL"],
      role_level: "Senior",
      domain: "Fintech",
    });
    vi.mocked(generateChallenge).mockResolvedValue("Design a payments ledger.");

    const res = await GET(makeContext("s1") as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ready: true });
    expect(guardAiCall).toHaveBeenNthCalledWith(1, expect.anything(), {
      userId: "user-1",
      ip: "203.0.113.7",
      operation: "extract",
    });
    expect(guardAiCall).toHaveBeenNthCalledWith(2, expect.anything(), {
      userId: "user-1",
      ip: "203.0.113.7",
      operation: "generate",
    });
    expect(extractConstraints).toHaveBeenCalledTimes(1);
    expect(generateChallenge).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "challenge_generated",
      properties: {
        mode: "jd",
        role_level: "Senior",
        domain: "Fintech",
        challenge_index: 1,
        generation_ms: expect.any(Number),
      },
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
