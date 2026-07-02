---
change_id: multi-turn-loop
title: Multi-turn loop
status: implementing
created: 2026-07-01
updated: 2026-07-01
archived_at: null
---

## Notes

Continuous turn-based interview loop. User submits answer → evaluation → follow-up → answer editor re-appears → repeat. Interviewer provides specific feedback on weak points and strengths. Also fixes challenge_id in API routes broken by F-02 (challenges table with NOT NULL FK).

Covers FR-019, FR-020. Depends on F-02 (challenges table), S-02 (evaluation pipeline).
