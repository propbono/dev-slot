---
change_id: configurable-auto-complete
title: Configurable auto-complete
status: implementing
created: 2026-07-01
updated: 2026-07-01
archived_at: null
---

## Notes

New feature: make auto-complete thresholds configurable. Currently hardcoded to 3 consecutive strong answers. User wants to configure how the interview challenge finishes:

- Maximum total rounds (weak + strong) — finish after N answers regardless of quality
- Minimum strong answers — finish after X strong answers (consecutive or cumulative)

Configuration stored per-challenge or as global settings.
