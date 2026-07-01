import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JDInput from "./JDInput";

describe("JDInput", () => {
  it("renders textarea and submit button", () => {
    render(<JDInput />);
    expect(
      screen.getAllByPlaceholderText(/paste a full job description/i)[0],
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/generate challenge/i)[0],
    ).toBeInTheDocument();
  });

  it("disables submit when under 50 characters", () => {
    render(<JDInput />);
    const buttons = screen.getAllByText(/generate challenge/i);
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it("enables submit at 50+ characters", () => {
    render(<JDInput />);
    const textareas = screen.getAllByPlaceholderText(
      /paste a full job description/i,
    );
    fireEvent.change(textareas[textareas.length - 1], {
      target: {
        value:
          "Senior Backend Engineer with distributed systems experience in AWS and Kafka. Must have 8+ years building event-driven architectures.",
      },
    });
    const buttons = screen.getAllByText(/generate challenge/i);
    expect(buttons[buttons.length - 1]).not.toBeDisabled();
  });

  it("shows error message when error prop is set", () => {
    render(<JDInput error="jd_too_short" />);
    expect(
      screen.getAllByText(/job description is too short/i)[0],
    ).toBeInTheDocument();
  });
});
