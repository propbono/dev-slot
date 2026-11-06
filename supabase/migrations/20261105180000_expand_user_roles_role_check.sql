-- Fix the blocking role constraint: tiers.ts defines 'pro' and 'unlimited'
-- tiers, but the original inline CHECK on user_roles.role (from
-- 20260702175109_user_roles_usage.sql) only allowed ('user','admin'), so the
-- paid tiers were unreachable. Expand the allowed set without touching the
-- existing RLS policies.

DO $$
DECLARE
  c record;
BEGIN
  -- Drop every CHECK constraint that covers the role column (the inline
  -- column constraint was auto-named, so resolve it dynamically rather than
  -- guessing). This is the only such constraint on this table.
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND contype = 'c'
      AND conkey @> ARRAY[
        (SELECT attnum
         FROM pg_attribute
         WHERE attrelid = 'public.user_roles'::regclass
           AND attname = 'role')
      ]
  LOOP
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('user', 'pro', 'unlimited', 'admin'));
