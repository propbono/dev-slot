---
change_id: auto-complete-summaries
title: Auto-complete and summaries
status: implementing
created: 2026-07-01
updated: 2026-07-01
archived_at: 2026-07-01T21:08:00Z
---

## Notes

Track consecutive strong evaluations per challenge. After 2-3 consecutive "strong" answers, auto-complete the challenge with a comprehensive summary (quality, confidence, strengths, improvement areas). The summary is generated via a separate LLM call that synthesizes the full conversation.

Covers FR-021, FR-022. Depends on S-05 (multi-turn loop).
