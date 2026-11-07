import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import CheckoutButton from "./CheckoutButton";

type LocationMock = {
  href: string;
  reload: ReturnType<typeof vi.fn>;
};

const originalLocation = window.location;
let location: LocationMock;

function mockLocation(): void {
  location = { href: "", reload: vi.fn() };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: location,
    writable: true,
  });
}

function restoreLocation(): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
    writable: true,
  });
}

function stubFetch(ok: boolean, payload: { url?: string | null; error?: string; detail?: string }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CheckoutButton", () => {
  beforeEach(() => {
    mockLocation();
  });

  afterEach(() => {
    cleanup();
    restoreLocation();
    vi.unstubAllGlobals();
  });

  it("renders the label", () => {
    render(<CheckoutButton tier="pro" label="Get Pro — CA$10/mo" />);
    expect(screen.getByRole("button", { name: /Get Pro/ })).toBeInTheDocument();
  });

  it("POSTs to the checkout endpoint with the requested tier", async () => {
    const fetchMock = stubFetch(true, { url: "https://checkout.stripe.com/example" });

    render(<CheckoutButton tier="unlimited" label="Get Unlimited — CA$15/mo" />);
    fireEvent.click(screen.getByRole("button", { name: /Get Unlimited/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "unlimited" }),
      });
    });
    expect(location.href).toBe("https://checkout.stripe.com/example");
  });

  it("redirects to signup when the endpoint reports unauthorized", async () => {
    stubFetch(false, { error: "unauthorized" });

    render(<CheckoutButton tier="pro" label="Get Pro — CA$10/mo" />);
    fireEvent.click(screen.getByRole("button", { name: /Get Pro/ }));

    await waitFor(() => {
      expect(location.href).toBe("/auth/signup");
    });
  });

  it("redirects to the account page when checkout returns no URL (plan change)", async () => {
    stubFetch(true, { url: null });

    render(<CheckoutButton tier="pro" label="Get Pro — CA$10/mo" />);
    fireEvent.click(screen.getByRole("button", { name: /Get Pro/ }));

    await waitFor(() => {
      expect(location.href).toBe("/account?checkout=success");
    });
  });

  it("shows an error when checkout fails", async () => {
    stubFetch(false, { error: "checkout_error" });

    render(<CheckoutButton tier="pro" label="Get Pro — CA$10/mo" />);
    fireEvent.click(screen.getByRole("button", { name: /Get Pro/ }));

    expect(await screen.findByText(/Could not start checkout/i)).toBeInTheDocument();
  });

  it("shows the server detail when checkout fails with a specific cause", async () => {
    stubFetch(false, { error: "not_configured", detail: "STRIPE_SECRET_KEY is not set" });

    render(<CheckoutButton tier="pro" label="Get Pro — CA$10/mo" />);
    fireEvent.click(screen.getByRole("button", { name: /Get Pro/ }));

    expect(await screen.findByText(/STRIPE_SECRET_KEY is not set/i)).toBeInTheDocument();
  });
});
