"use client";

import { useState, useEffect, useRef } from "react";

type Props = {
  sessionId: string;
}

const STAGES = [
  "Creating your interview session...",
  "Analyzing job description...",
  "Crafting your challenge...",
];
const POLL_INTERVAL = 2000;

export default function GenerationSkeleton({ sessionId }: Props) {
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const advance = () => {
      setStage((prev) => Math.min(prev + 1, STAGES.length - 1));
    };

    // Advance through stages with simulated timing
    const stageTimers: ReturnType<typeof setTimeout>[] = [];
    STAGES.forEach((_, i) => {
      if (i > 0) {
        stageTimers.push(setTimeout(advance, i * 2500));
      }
    });

    // Poll the generate endpoint
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/interview/generate?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (!res.ok && res.status !== 404) {
          setError("Generation failed. Return to dashboard and try again.");
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        const data = await res.json();
        if (data.ready) {
          if (pollRef.current) clearInterval(pollRef.current);
          window.location.reload();
        } else if (data.error) {
          setError("Generation failed. Return to dashboard and try again.");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Network error — keep polling, don't show error immediately
      }
    }, POLL_INTERVAL);

    return () => {
      stageTimers.forEach(clearTimeout);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 backdrop-blur-xl">
          <h2 className="mb-3 text-xl font-bold text-red-200">
            Generation Failed
          </h2>
          <p className="mb-6 text-sm text-red-300/80">{error}</p>
          <a
            href="/new-session"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-24">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        <div className="mb-8 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>

        <div className="space-y-4">
          {STAGES.map((label, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  i <= stage
                    ? i === stage
                      ? "bg-purple-400 animate-pulse"
                      : "bg-purple-600"
                    : "bg-white/10"
                }`}
              />
              <span
                className={`text-sm transition-colors ${
                  i <= stage ? "text-blue-100/80" : "text-blue-100/30"
                }`}
              >
                {label}
              </span>
              {i < stage && (
                <svg
                  className="h-4 w-4 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m5 13 4 4L19 7"
                  />
                </svg>
              )}
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-blue-100/30">
          This usually takes 5-10 seconds
        </p>
      </div>
    </div>
  );
}
