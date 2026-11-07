import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JDInput from "./JDInput";

describe("JDInput", () => {
  it("renders mode tabs", () => {
    render(<JDInput />);
    expect(screen.getAllByText(/job description/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/^tech stack$/i)[0]).toBeInTheDocument();
  });

  it("shows JD textarea by default", () => {
    render(<JDInput />);
    expect(screen.getAllByPlaceholderText(/paste a full job description/i)[0]).toBeInTheDocument();
    // Tech stack fields should not be visible
    const allTechFields = screen.queryAllByPlaceholderText(/React, AWS, Kafka/);
    expect(allTechFields.length).toBe(0);
  });

  it("switches to tech stack fields on tab click", () => {
    render(<JDInput />);
    fireEvent.click(screen.getAllByText(/^tech stack$/i)[0]);
    expect(screen.getByPlaceholderText(/React, AWS, Kafka/)).toBeInTheDocument();
    expect(screen.getByText(/select role level/i)).toBeInTheDocument();
  });

  it("disables submit when under 50 characters", () => {
    render(<JDInput />);
    const buttons = screen.getAllByText(/generate challenge/i);
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it("enables submit at 50+ characters", () => {
    render(<JDInput />);
    const textareas = screen.getAllByPlaceholderText(/paste a full job description/i);
    fireEvent.change(textareas[textareas.length - 1], {
      target: {
        value:
          "Senior Backend Engineer with distributed systems experience in AWS and Kafka. Must have 8+ years building event-driven architectures.",
      },
    });
    const buttons = screen.getAllByText(/generate challenge/i);
    expect(buttons[buttons.length - 1]).not.toBeDisabled();
  });

  it("disables submit in tech stack mode when technologies empty", () => {
    render(<JDInput />);
    fireEvent.click(screen.getAllByText(/^tech stack$/i)[0]);
    const buttons = screen.getAllByText(/generate challenge/i);
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it("shows upgrade prompt when error is upgrade_required", () => {
    render(<JDInput error="upgrade_required" />);
    expect(screen.getAllByText(/reached your free tier limit/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/View Plans/i)[0]).toBeInTheDocument();
  });

  it("renders real upgrade buttons instead of the coming-soon placeholder", () => {
    render(<JDInput error="upgrade_required" />);
    fireEvent.click(screen.getAllByText(/View Plans/i)[0]);
    expect(screen.getByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upgrade to Unlimited/ })).toBeInTheDocument();
    expect(screen.queryByText(/Payment processing is coming soon/i)).not.toBeInTheDocument();
  });

  it("calls the checkout endpoint when an upgrade button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "not_configured", detail: "STRIPE_SECRET_KEY is not set" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<JDInput error="upgrade_required" />);
    fireEvent.click(screen.getAllByText(/View Plans/i)[0]);
    fireEvent.click(screen.getByRole("button", { name: /Upgrade to Pro/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "pro" }),
      });
    });
    expect(await screen.findByText(/STRIPE_SECRET_KEY is not set/i)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
