---
change_id: session-history
title: Session history
status: implementing
created: 2026-07-01
updated: 2026-07-01
archived_at: null
---

## Notes

User can end an active interview session, browse a list of their completed/abandoned sessions, and open a full chronological transcript of any past session. Covers FR-003, FR-015, FR-016, FR-017.

Prerequisites: F-01 (sessions + messages tables), S-01 (session creation from JD). The history page reads from existing sessions — no new data model changes needed beyond reading what's already created.
