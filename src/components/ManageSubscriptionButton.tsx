import { useState } from "react";

export default function ManageSubscriptionButton() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleManage() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string; detail?: string };
      if (!res.ok) {
        if (data.error === "unauthorized") {
          window.location.href = "/auth/signin";
          return;
        }
        setError(data.detail ?? "Could not open the billing portal. Please try again.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Could not open the billing portal. Please try again.");
    } catch {
      setError("Could not open the billing portal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={submitting}
        onClick={() => {
          void handleManage();
        }}
        className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Opening portal..." : "Manage subscription"}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
