---
change_id: session-history-fixes
title: Session history fixes
status: archived
created: 2026-07-01
updated: 2026-07-01
archived_at: 2026-07-01T12:02:00Z
---

## Notes

Three fixes for the session-history implementation:

1. Replace browser `confirm()` dialog with a styled React confirm dialog that matches the cosmic theme
2. Show date AND time in the history page session list (currently only shows date)
3. Fix "Invalid date" on the completion banner — currently using `session.created_at` instead of the session end time
