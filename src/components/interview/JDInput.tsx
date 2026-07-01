"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  error?: string;
};

export default function JDInput({ error }: Props) {
  const [mode, setMode] = useState<"jd" | "tech-stack">("jd");
  const [submitting, setSubmitting] = useState(false);

  // JD mode state
  const [jd, setJd] = useState("");
  // Tech stack mode state
  const [technologies, setTechnologies] = useState("");
  const [role, setRole] = useState("");
  const [domain, setDomain] = useState("");

  const jdCharCount = jd.length;
  const canSubmitJd = jdCharCount >= 50;
  const jdTooShort = jdCharCount > 0 && jdCharCount < 50;
  const canSubmitTechStack = technologies.trim().length > 0 && role !== "";
  const canSubmit = mode === "jd" ? canSubmitJd : canSubmitTechStack;

  const errorMessages: Record<string, string> = {
    jd_too_short:
      "Job description is too short. Paste at least 50 characters.",
    generation_failed: "Challenge generation failed. Please try again.",
    session_failed: "Could not create interview session. Please try again.",
    not_configured: "AI service is not configured. Check your API keys.",
    missing_fields: "Please fill in all required fields.",
    missing_tech_stack:
      "Please enter technologies and select a role level.",
  };

  const errorText =
    error && (errorMessages[error] ?? "An unexpected error occurred.");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h2 className="mb-2 text-center text-2xl font-bold text-white">
        New Interview
      </h2>
      <p className="mb-8 text-center text-blue-100/60">
        {mode === "jd"
          ? "Paste a job description to generate a tailored architecture challenge."
          : "Enter the tech stack details for your target role."}
      </p>

      {/* Mode tabs */}
      <div className="mb-6 flex justify-center gap-1">
        <button
          type="button"
          onClick={() => setMode("jd")}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "jd"
              ? "bg-purple-600 text-white"
              : "bg-white/5 text-blue-100/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          Job Description
        </button>
        <button
          type="button"
          onClick={() => setMode("tech-stack")}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "tech-stack"
              ? "bg-purple-600 text-white"
              : "bg-white/5 text-blue-100/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          Tech Stack
        </button>
      </div>

      {errorText && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorText}
        </div>
      )}

      <form
        method="POST"
        action="/api/interview/create"
        onSubmit={() => setSubmitting(true)}
      >
        <input type="hidden" name="mode" value={mode} />

        {mode === "jd" ? (
          <>
            <textarea
              name="jd"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste a full job description (minimum 50 characters)..."
              rows={12}
              className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-blue-100/40 backdrop-blur-sm focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
            <div className="mt-3 flex items-center justify-between">
              <span
                className={`text-sm ${jdTooShort ? "text-red-300" : "text-blue-100/50"}`}
              >
                {jdCharCount}/50 minimum
              </span>
              <Button
                type="submit"
                disabled={!canSubmit || submitting}
                className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Generating challenge..." : "Generate Challenge"}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-blue-100/60">
                Technologies
              </label>
              <input
                type="text"
                name="technologies"
                value={technologies}
                onChange={(e) => setTechnologies(e.target.value)}
                placeholder="e.g., React, AWS, Kafka"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-blue-100/40 backdrop-blur-sm focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-blue-100/60">
                Role Level
              </label>
              <select
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white backdrop-blur-sm focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              >
                <option value="">Select role level...</option>
                <option value="Junior">Junior</option>
                <option value="Mid">Mid</option>
                <option value="Senior">Senior</option>
                <option value="Staff">Staff</option>
                <option value="Principal">Principal</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-blue-100/60">
                Domain
              </label>
              <input
                type="text"
                name="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g., Fintech, Healthcare, SaaS"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-blue-100/40 backdrop-blur-sm focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!canSubmit || submitting}
                className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Generating challenge..." : "Generate Challenge"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
