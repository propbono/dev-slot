-- Grant base table privileges to the app roles.
--
-- Supabase's default ALTER DEFAULT PRIVILEGES does not reliably apply to
-- tables created via `supabase db push`, which left these public-schema tables
-- accessible only to postgres/service_role. The app's server client runs as
-- `authenticated` (and public pages as `anon`), so without these grants every
-- query fails with "permission denied for table ..." even though RLS policies
-- are correct. RLS still enforces row-level access after these grants.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Future tables get the same base grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
