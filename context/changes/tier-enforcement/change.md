---
change_id: tier-enforcement
title: Tier enforcement
status: implementing
created: 2026-07-02
updated: 2026-07-02
archived_at: null
---

## Notes

API checks for user tier limits. Before creating new sessions, turns, or challenges, check the user's current tier (from user_roles) and usage counters. Free tier users see an upgrade prompt when they hit their single interview limit.

Covers FR-035, FR-036. Depends on F-03 (user_roles + usage_counters tables).
