-- Per-user in-flight checkout guard. The checkout endpoint claims a row here
-- before creating a Checkout Session and the webhook releases it once
-- checkout.session.completed persists, so two concurrent checkout requests
-- (same or different tier) can never create two Checkout Sessions/subscriptions.
-- Abandoned claims are reclaimed by the checkout endpoint after a short stale
-- window (see CHECKOUT_CLAIM_STALE_MS in src/pages/api/stripe/checkout.ts).

CREATE TABLE IF NOT EXISTS checkout_inflight (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('pro', 'unlimited')),
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checkout_inflight ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own checkout claim" ON checkout_inflight;
CREATE POLICY "Users can view own checkout claim" ON checkout_inflight
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can claim own checkout" ON checkout_inflight;
CREATE POLICY "Users can claim own checkout" ON checkout_inflight
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can release own checkout claim" ON checkout_inflight;
CREATE POLICY "Users can release own checkout claim" ON checkout_inflight
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can reclaim own checkout claim" ON checkout_inflight;
CREATE POLICY "Users can reclaim own checkout claim" ON checkout_inflight
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
