"use client";

import { useState } from "react";

type Props = {
  sessionId: string;
}

export default function EndSessionButton({ sessionId }: Props) {
  const [open, setOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  const handleConfirm = async () => {
    setEnding(true);
    const formData = new FormData();
    formData.append("sessionId", sessionId);
    await fetch("/api/interview/end", { method: "POST", body: formData });
    window.location.reload();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        End Session
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-white">
              End this session?
            </h3>
            <p className="mb-6 text-sm text-blue-100/60">
              Your transcript will be saved and available in your session
              history.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={ending}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-blue-100/70 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={ending}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
              >
                {ending ? "Ending..." : "End Session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
