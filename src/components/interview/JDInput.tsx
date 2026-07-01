"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  error?: string;
}

export default function JDInput({ error }: Props) {
  const [jd, setJd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const charCount = jd.length;
  const canSubmit = charCount >= 50;
  const tooShort = charCount > 0 && charCount < 50;

  const errorMessages: Record<string, string> = {
    jd_too_short: "Job description is too short. Paste at least 50 characters.",
    generation_failed: "Challenge generation failed. Please try again.",
    session_failed: "Could not create interview session. Please try again.",
    not_configured: "AI service is not configured. Check your API keys.",
  };

  const errorText = error && (errorMessages[error] ?? "An unexpected error occurred.");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h2 className="mb-2 text-center text-2xl font-bold text-white">New Interview</h2>
      <p className="mb-8 text-center text-blue-100/60">
        Paste a job description to generate a tailored architecture challenge.
      </p>

      {errorText && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorText}
        </div>
      )}

      <form method="POST" action="/api/interview/create" onSubmit={() => setSubmitting(true)}>
        <textarea
          name="jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste a full job description (minimum 50 characters)..."
          rows={12}
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-blue-100/40 backdrop-blur-sm focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />

        <div className="mt-3 flex items-center justify-between">
          <span className={`text-sm ${tooShort ? "text-red-300" : "text-blue-100/50"}`}>
            {charCount}/50 minimum
          </span>

          <Button
            type="submit"
            disabled={!canSubmit || submitting}
            className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Generating challenge..." : "Generate Challenge"}
          </Button>
        </div>
      </form>
    </div>
  );
}
