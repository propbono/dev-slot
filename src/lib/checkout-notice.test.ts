import { describe, expect, it } from "vitest";
import { checkoutNotice } from "./checkout-notice";

describe("checkoutNotice", () => {
  it("returns a success banner for the success param", () => {
    expect(checkoutNotice("success")).toMatchObject({
      variant: "success",
      title: "Payment successful",
    });
  });

  it("returns a warning banner for the cancelled param", () => {
    expect(checkoutNotice("cancelled")).toMatchObject({
      variant: "warning",
      title: "Checkout cancelled",
    });
  });

  it("returns null for absent or unknown params", () => {
    expect(checkoutNotice(null)).toBeNull();
    expect(checkoutNotice(undefined)).toBeNull();
    expect(checkoutNotice("nonsense")).toBeNull();
  });
});
