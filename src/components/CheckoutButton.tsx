import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  tier: "pro" | "unlimited";
  label: string;
  variant?: "primary" | "secondary";
};

export default function CheckoutButton({ tier, label, variant = "primary" }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await res.json()) as { url?: string | null; error?: string; detail?: string };
      if (!res.ok) {
        if (data.error === "unauthorized") {
          window.location.href = "/auth/signup";
          return;
        }
        setError(data.detail ?? "Could not start checkout. Please try again.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not start checkout. Please try again.");
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
          void handleCheckout();
        }}
        className={cn(
          "block w-full rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          variant === "primary"
            ? "bg-purple-600 text-white hover:bg-purple-500"
            : "border border-white/20 bg-white/5 text-white hover:bg-white/10",
        )}
      >
        {submitting ? "Starting checkout..." : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
