---
change_id: user-roles-usage
title: User roles and usage counters
status: implementing
created: 2026-07-02
updated: 2026-07-02
archived_at: null
---

## Notes

Foundation F-03 for admin, billing & subscriptions. Add `role` column to users (default: 'user', enum: 'user'|'admin') and create `usage_counters` table (user_id, interviews_this_month, turns_this_challenge, challenges_this_session, billing_cycle_start).

Covers FR-039, FR-040. Unlocks S-09 (tier enforcement), S-10 (Stripe), S-11 (admin dashboard).
