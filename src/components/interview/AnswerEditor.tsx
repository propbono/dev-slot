"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";

type Props = {
  sessionId: string;
  initialDraft?: string;
  evaluationError?: string;
}

export default function AnswerEditor({
  sessionId,
  initialDraft,
  evaluationError,
}: Props) {
  const [content, setContent] = useState(initialDraft ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSubmit = content.length >= 20;

  // Auto-save draft every 3 seconds
  const saveDraft = useCallback(
    async (text: string) => {
      if (text.length === 0) return;
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("content", text);
      try {
        await fetch("/api/interview/draft", { method: "POST", body: formData });
        setLastSaved(new Date());
      } catch {
        // Silently fail — user shouldn't notice draft save errors
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (content.length > 0) {
      timerRef.current = setTimeout(() => {
        saveDraft(content);
      }, 3000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, saveDraft]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Your Solution</h3>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-blue-100/40">
              Draft saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
            className="rounded border border-white/20 px-3 py-1 text-xs text-blue-100/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
        </div>
      </div>

      {evaluationError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {evaluationError}
        </div>
      )}

      {mode === "edit" ? (
        <textarea
          name="answer"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type your architectural solution here... Use markdown for formatting."
          rows={16}
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder-blue-100/40 backdrop-blur-sm focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      ) : (
        <div className="min-h-[24rem] rounded-xl border border-white/10 bg-white/5 px-6 py-4 backdrop-blur-sm">
          {content.length > 0 ? (
            <div className="prose prose-invert max-w-none text-blue-100/90">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-blue-100/40">
              Nothing to preview yet. Switch to Edit mode to start typing.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span
          className={`text-sm ${content.length > 0 && content.length < 20 ? "text-red-300" : "text-blue-100/50"}`}
        >
          {content.length}/20 minimum
        </span>

        <form
          method="POST"
          action={`/api/interview/evaluate`}
          onSubmit={() => setSubmitting(true)}
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="answer" value={content} />
          <Button
            type="submit"
            disabled={!canSubmit || submitting}
            className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Evaluating..." : "Submit Solution"}
          </Button>
        </form>
      </div>
    </div>
  );
}
