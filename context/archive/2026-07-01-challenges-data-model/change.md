---
change_id: challenges-data-model
title: Challenges data model
status: archived
created: 2026-07-01
updated: 2026-07-01
archived_at: 2026-07-01T19:37:00Z
---

## Notes

Foundation F-02 for multi-turn interview trees. Create `challenges` table (id, session_id, status, summary JSONB) and add `challenge_id` FK to `session_messages`. Migration must handle existing session_messages rows — assign them to a default challenge per session.

Covers FR-027, FR-028. Prerequisite for S-05, S-07, S-08.
