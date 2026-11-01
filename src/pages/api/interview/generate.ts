import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { extractConstraints, generateChallenge, type JDConstraints } from "@/lib/ai";
import { guardAiCall } from "@/lib/ai-guard";

// If a "generating" lock is older than this, the request that created it is
// presumed dead and the lock is released so generation can be retried.
const GENERATION_STALE_MS = 90_000;

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ ready: false, error: "not_configured" });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ready: false, error: "unauthorized" }, { status: 401 });

  const sessionId = context.url.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ ready: false, error: "missing_session" }, { status: 400 });

  // Verify session ownership
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionErr || !session) return Response.json({ ready: false, error: "session_not_found" }, { status: 404 });

  // Active challenge is required as the challenge_id for the generation marker.
  const { data: activeChallenge } = await supabase
    .from("challenges")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!activeChallenge) return Response.json({ ready: false, error: "no_active_challenge" }, { status: 404 });

  // If a committed interviewer message already exists, generation is done.
  const { data: genMsgs } = await supabase
    .from("session_messages")
    .select("id, status, created_at")
    .eq("session_id", sessionId)
    .eq("role", "interviewer")
    .in("status", ["committed", "generating"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (genMsgs?.some((m) => m.status === "committed")) {
    return Response.json({ ready: true });
  }

  // An in-flight "generating" lock means another request is already working.
  const generating = genMsgs?.find((m) => m.status === "generating");
  if (generating) {
    const ageMs = Date.now() - new Date(generating.created_at).getTime();
    if (ageMs < GENERATION_STALE_MS) {
      return Response.json({ ready: false });
    }
    // Stale lock from a crashed request — release it and retry below.
    await supabase.from("session_messages").delete().eq("id", generating.id);
  }

  // Acquire the generation lock (unique partial index guarantees one writer).
  const { data: marker, error: lockErr } = await supabase
    .from("session_messages")
    .insert({
      session_id: sessionId,
      role: "interviewer",
      content: "",
      status: "generating",
      challenge_id: activeChallenge.id,
    })
    .select("id")
    .single();

  if (lockErr || !marker) {
    // Another request already holds the lock — keep polling.
    return Response.json({ ready: false });
  }
  const markerId = marker.id;

  // Read JD/system message.
  const { data: systemMsgs } = await supabase
    .from("session_messages")
    .select("content")
    .eq("session_id", sessionId)
    .eq("role", "system")
    .eq("status", "committed")
    .order("created_at")
    .limit(1);

  if (!systemMsgs || systemMsgs.length === 0) {
    await supabase.from("session_messages").delete().eq("id", markerId);
    return Response.json({ ready: false, error: "no_jd_found" });
  }

  let jd: string;
  let mode = "jd";
  let systemContent: Record<string, unknown> = {};
  try {
    systemContent = JSON.parse(systemMsgs[0].content);
    mode = (systemContent.mode as string) || "jd";
    jd = (systemContent.raw_jd as string) || "";
    if (!jd && mode === "jd") throw new Error("Missing raw_jd");
  } catch {
    await supabase.from("session_messages").delete().eq("id", markerId);
    return Response.json({ ready: false, error: "invalid_jd" });
  }

  try {
    let constraints: JDConstraints;

    if (mode === "tech-stack") {
      constraints = {
        tech_stack: (systemContent.technologies as string)
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
        role_level: systemContent.role_level as string,
        domain: (systemContent.domain as string) || "General",
      };
      jd = `Targeting a ${constraints.role_level} role in ${constraints.domain} with experience in ${constraints.tech_stack.join(", ")}.`;
      const tags = (systemContent.tags as string)?.trim();
      if (tags) {
        jd += ` Focus the challenge on these topics: ${tags}.`;
      }
    } else {
      const extractGuard = await guardAiCall(supabase, {
        userId: user.id,
        ip: context.clientAddress,
        operation: "extract",
      });
      if (!extractGuard.allowed) {
        await supabase.from("session_messages").delete().eq("id", markerId);
        return Response.json({ ready: false, error: extractGuard.reason }, { status: 429 });
      }
      constraints = await extractConstraints(jd);
    }

    // Update system message with extracted constraints.
    await supabase
      .from("session_messages")
      .update({
        content: JSON.stringify({
          ...(mode === "tech-stack"
            ? { mode: "tech-stack", technologies: systemContent.technologies }
            : { raw_jd: jd, mode: "jd" }),
          tech_stack: constraints.tech_stack,
          role_level: constraints.role_level,
          domain: constraints.domain,
          status: "extracted",
        }),
      })
      .eq("session_id", sessionId)
      .eq("role", "system")
      .eq("status", "committed");

    // Step 2: Generate challenge.
    const generateGuard = await guardAiCall(supabase, {
      userId: user.id,
      ip: context.clientAddress,
      operation: "generate",
    });
    if (!generateGuard.allowed) {
      await supabase.from("session_messages").delete().eq("id", markerId);
      return Response.json({ ready: false, error: generateGuard.reason }, { status: 429 });
    }
    const challengeText = await generateChallenge(jd, constraints);

    // Promote the marker to a committed interviewer message.
    await supabase.from("session_messages").update({ content: challengeText, status: "committed" }).eq("id", markerId);

    // Mark session active.
    await supabase.from("sessions").update({ status: "active" }).eq("id", sessionId);

    return Response.json({ ready: true });
  } catch {
    await supabase.from("session_messages").delete().eq("id", markerId).eq("status", "generating");
    return Response.json({ ready: false, error: "generation_failed" });
  }
};
