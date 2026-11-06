-- Stripe customer linkage. The webhook maps a Stripe customer back to the
-- owning user via this column after checkout.session.completed. Free-tier
-- rows keep NULL (allowed to repeat), paid rows are unique per customer.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_stripe_customer_id
  ON public.user_roles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
