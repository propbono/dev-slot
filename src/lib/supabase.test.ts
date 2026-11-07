import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { isEmailConfirmed } from "./supabase";

function user(fields: Partial<User>): User {
  return { id: "user-1", ...fields } as User;
}

describe("isEmailConfirmed", () => {
  it("returns false when there is no user", () => {
    expect(isEmailConfirmed(null)).toBe(false);
    expect(isEmailConfirmed(undefined)).toBe(false);
  });

  it("returns false when neither confirmation timestamp is present", () => {
    expect(isEmailConfirmed(user({}))).toBe(false);
  });

  it("returns true when email_confirmed_at is set", () => {
    expect(isEmailConfirmed(user({ email_confirmed_at: "2024-01-01T00:00:00Z" }))).toBe(true);
  });

  it("returns true when the legacy confirmed_at alias is set", () => {
    expect(isEmailConfirmed(user({ confirmed_at: "2024-01-01T00:00:00Z" }))).toBe(true);
  });
});
