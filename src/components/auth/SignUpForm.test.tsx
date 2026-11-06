import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SignUpForm from "./SignUpForm";

function submitForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("form not found");
  fireEvent.submit(form);
}

describe("SignUpForm consent checkbox", () => {
  it("renders the consent checkbox linking to Terms and Privacy Policy", () => {
    render(<SignUpForm />);

    const checkbox = screen.getByLabelText(/by continuing, i agree to the/i);
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    const termsLink = screen.getByRole("link", { name: /terms of service/i });
    expect(termsLink).toHaveAttribute("href", "/terms");

    const privacyLink = screen.getByRole("link", { name: /privacy policy/i });
    expect(privacyLink).toHaveAttribute("href", "/privacy");
  });

  it("blocks submission and shows an error when the box is not checked", () => {
    render(<SignUpForm />);

    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "dev@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "hunter22" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm password$/i), {
      target: { value: "hunter22" },
    });

    submitForm();

    expect(screen.getByText(/you must agree to the terms of service and privacy policy/i)).toBeInTheDocument();
  });

  it("clears the error once the user agrees", () => {
    render(<SignUpForm />);

    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "dev@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "hunter22" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm password$/i), {
      target: { value: "hunter22" },
    });

    submitForm();
    expect(screen.getByText(/you must agree to the terms of service and privacy policy/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/by continuing, i agree to the/i));

    expect(screen.queryByText(/you must agree to the terms of service and privacy policy/i)).not.toBeInTheDocument();
  });
});
