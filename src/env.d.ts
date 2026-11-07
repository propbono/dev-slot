declare namespace App {
  type Locals = {
    user: import("@supabase/supabase-js").User | null;
    role: import("@/lib/tiers").TierRole | null;
  };
}
