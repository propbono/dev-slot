---
change_id: jd-streaming
title: JD streaming
status: implemented
created: 2026-06-28
updated: 2026-06-28
archived_at: null
---

## Notes

Redirect to session page immediately after JD submission, then stream the challenge generation instead of blocking the POST → redirect cycle. Improves perceived performance — user sees the session page right away with a loading skeleton while the LLM works.

Builds on S-01 (jd-to-challenge). Touches generate.ts API route and the session page.
