export type CheckoutNotice = {
  variant: "success" | "warning";
  title: string;
  message: string;
};

/**
 * Map the `?checkout=` query param (set by Stripe's `success_url`/`cancel_url`)
 * to a banner. Returns `null` when the param is absent or unrecognized, so
 * pages can render nothing for a plain visit.
 */
export function checkoutNotice(param: string | null | undefined): CheckoutNotice | null {
  if (param === "success") {
    return {
      variant: "success",
      title: "Payment successful",
      message: "Your subscription is being activated — it should appear within a few seconds.",
    };
  }
  if (param === "cancelled") {
    return {
      variant: "warning",
      title: "Checkout cancelled",
      message: "Your plan hasn't changed. You can upgrade whenever you're ready.",
    };
  }
  return null;
}
