import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import ManageSubscriptionButton from "./ManageSubscriptionButton";

const originalLocation = window.location;
let location: { href: string };

function mockLocation(): void {
  location = { href: "" };
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

function stubFetch(ok: boolean, payload: { url?: string; error?: string; detail?: string }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ManageSubscriptionButton", () => {
  beforeEach(() => {
    mockLocation();
  });

  afterEach(() => {
    cleanup();
    restoreLocation();
    vi.unstubAllGlobals();
  });

  it("renders the manage label", () => {
    render(<ManageSubscriptionButton />);
    expect(screen.getByRole("button", { name: /Manage subscription/ })).toBeInTheDocument();
  });

  it("POSTs to the portal endpoint and navigates to the returned URL", async () => {
    const fetchMock = stubFetch(true, { url: "https://billing.stripe.com/session/xyz" });

    render(<ManageSubscriptionButton />);
    fireEvent.click(screen.getByRole("button", { name: /Manage subscription/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/stripe/portal", { method: "POST" });
    });
    expect(location.href).toBe("https://billing.stripe.com/session/xyz");
  });

  it("redirects to signin when the endpoint reports unauthorized", async () => {
    stubFetch(false, { error: "unauthorized" });

    render(<ManageSubscriptionButton />);
    fireEvent.click(screen.getByRole("button", { name: /Manage subscription/ }));

    await waitFor(() => {
      expect(location.href).toBe("/auth/signin");
    });
  });

  it("shows the server detail when the portal cannot be opened", async () => {
    stubFetch(false, { error: "portal_error", detail: "no portal config" });

    render(<ManageSubscriptionButton />);
    fireEvent.click(screen.getByRole("button", { name: /Manage subscription/ }));

    expect(await screen.findByText(/no portal config/i)).toBeInTheDocument();
  });

  it("shows a generic error when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<ManageSubscriptionButton />);
    fireEvent.click(screen.getByRole("button", { name: /Manage subscription/ }));

    expect(await screen.findByText(/Could not open the billing portal/i)).toBeInTheDocument();
  });
});
