---
change_id: jd-to-challenge
title: JD to challenge pipeline
status: implemented
created: 2026-06-26
updated: 2026-06-26
archived_at: null
---

## Notes

Architecture challenge generation from pasted job description using DeepSeek V4 API. User pastes raw JD text → tech stack extracted → tailored system design challenge generated → session created in Supabase.

Covers FR-005, FR-007, FR-008, FR-009. Prerequisite F-01 (sessions + messages tables) is done.
