-- Single-subscription tracking. checkout.session.completed stores the Stripe
-- subscription id so the checkout endpoint can locate the existing subscription
-- for a plan change (subscriptions.update) instead of creating a second one, and
-- the webhook can match subscription events precisely (avoiding late-event
-- clobbering). Free-tier rows keep NULL (allowed to repeat), paid rows are
-- unique per subscription.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_stripe_subscription_id
  ON public.user_roles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
