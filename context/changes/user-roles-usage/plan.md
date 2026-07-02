# User Roles & Usage Counters — Implementation Plan

## Overview

Create `user_roles` and `usage_counters` tables — foundation for tier enforcement, subscription management, and admin dashboard.

## Migration

**File**: `supabase/migrations/<timestamp>_user_roles_usage.sql`

```sql
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own role" ON user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Seed existing users as 'user'
INSERT INTO user_roles (user_id, role)
SELECT id, 'user' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  interviews_this_month integer NOT NULL DEFAULT 0,
  billing_cycle_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage" ON usage_counters
  FOR SELECT TO authenticated USING (user_id = auth.uid());
```

## Success Criteria

- Build, typecheck, lint, tests pass
- Migration applied — tables visible in Supabase
- Existing users seeded with 'user' role

## Progress

- [x] 1.1 Build / typecheck / lint / test pass
- [x] 1.2 Migration file exists
- [x] 1.3 Migration applied to cloud — 95f7f09
- [x] 1.4 Existing users seeded with role — 95f7f09
