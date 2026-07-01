# Interview Mode Selector — Implementation Plan

## Overview

Add a mode selector to the "New Session" page so users can choose between pasting a job description (existing flow) or entering an explicit tech stack with role and domain (FR-004). The tech stack mode skips the JD extraction step and generates directly from the provided constraints.

## Current State Analysis

- **JDInput.tsx** renders a single textarea for JD paste, submits to `/api/interview/create`
- **create.ts** stores JD as `{ raw_jd, status: "pending" }` in a system message, redirects to interview
- **generate.ts** reads `raw_jd` from the system message, runs `extractConstraints()` + `generateChallenge()`
- Tech stack mode will bypass `extractConstraints()` — constraint data is provided directly

## Desired End State

User sees two tabs on the page: "Job Description" (default, current behavior) and "Tech Stack". Tech stack mode shows: technologies (text input), role level (dropdown: Junior/Mid/Senior/Staff/Principal), domain (text input). On submit, the API skips extraction and uses the provided constraints directly.

## What We're NOT Doing

- FR-006 (explicit tech tags to shape prompt) — that's a follow-up refinement of this mode
- Multi-step wizard — single-page mode toggle only
- Saving tech stack presets or templates

## Implementation Approach

Single phase. Two components (JDInput + create.ts) with branching logic based on a `mode` field.

JDInput gets a tab state that swaps between the textarea (JD mode) and three fields (tech stack mode). The form still POSTs to the same endpoint but includes `mode=jd` or `mode=tech-stack`. The create endpoint stores the mode type in the system message. The generate endpoint checks the mode and skips extraction if tech-stack.

## Phase 1: Mode Selector + API

### Changes Required:

#### 1. JDInput — tab state + tech stack fields

**File**: `src/components/interview/JDInput.tsx`

**Intent**: Add two tab buttons at the top: "Job Description" (default) and "Tech Stack". Tech stack mode shows three input fields instead of the textarea. Form validation adapts: JD mode requires ≥50 chars, tech stack mode requires technologies + role selected.

**Contract**:
- State: `mode` ("jd" | "tech-stack"), `technologies` (string), `role` (string), `domain` (string)
- Tabs: two buttons styled as tabs, active tab has purple highlight
- JD mode: same as current (textarea with 50-char minimum)
- Tech stack mode: 
  - Technologies: text input "e.g., React, AWS, Kafka"
  - Role level: `<select>` with Junior, Mid, Senior, Staff, Principal
  - Domain: text input "e.g., Fintech, Healthcare, SaaS"
- Submit button enabled when: JD mode AND ≥50 chars OR tech stack mode AND technologies.length > 0 AND role selected
- Hidden input: `<input type="hidden" name="mode" value={mode} />`
- Error banner: update error messages for tech-stack-specific errors

#### 2. Create API — handle mode field

**File**: `src/pages/api/interview/create.ts`

**Intent**: Read `mode` from form data. Store differently based on mode. For tech-stack mode, store `{ mode: "tech-stack", technologies, role, domain }` in the system message. For JD mode, same as before `{ raw_jd, status: "pending", mode: "jd" }`.

**Contract**:
- Read `mode` from form data, default to `"jd"`
- If mode is `"tech-stack"`: read `technologies`, `role`, `domain`. Validate technologies not empty + role selected. Store as system message: `{ mode: "tech-stack", technologies, role, domain }`
- If mode is `"jd"`: same as current
- Redirect to interview page as before

#### 3. Generate API — handle tech stack mode

**File**: `src/pages/api/interview/generate.ts`

**Intent**: When the system message has `mode: "tech-stack"`, skip `extractConstraints()` and use the provided technologies/role/domain directly. Build a `JDConstraints` object from the input and call `generateChallenge()` with a constructed JD text.

**Contract**:
- Read system message
- If `mode === "tech-stack"`: 
  - Build `JDConstraints = { tech_stack: technologies.split(",").map(s => s.trim()), role_level: role, domain }`
  - Construct a synthetic JD text: "Targeting a {role} role in {domain} with experience in {technologies}"
  - Call `generateChallenge(syntheticJd, constraints)` directly (skip extraction)
  - Update system message with extracted constraints (just re-use the input)
- If `mode === "jd"`: same as current (extract, then generate)

### Success Criteria:

#### Automated:

- `npm run build` passes, `npm run lint` passes, `npm run typecheck` passes, `npm test` passes
- Mode tabs visible in JDInput
- Tech stack fields hidden when JD tab active
- `create.ts` handles `mode` field
- `generate.ts` skips extraction for tech stack mode

#### Manual:

- Default tab is "Job Description" — JD textarea visible
- Click "Tech Stack" tab → JD textarea hidden, three fields shown
- Submit with tech stack → redirected to interview, challenge generated without JD
- Submit with JD mode → current behavior unchanged (no regression)
- Tech stack validation: submit disabled when technologies empty or role not selected

---

## Testing Strategy

### Unit Tests:

- JDInput renders both tabs, JD tab active by default
- Clicking "Tech Stack" tab swaps visible fields
- Form submits with correct hidden input fields
- Submit disabled in JD mode when < 50 chars
- Submit disabled in tech stack mode when technologies empty

### Manual Testing Steps:

1. Visit `/new-session` → JD tab active, textarea visible
2. Click "Tech Stack" → fields swap, JD textarea hidden
3. Fill tech stack fields → submit → redirected to interview, challenge generated
4. Existing JD flow → no regression

## References

- PRD: FR-004
- JDInput: `src/components/interview/JDInput.tsx`
- create.ts: `src/pages/api/interview/create.ts`
- generate.ts: `src/pages/api/interview/generate.ts`
- JDInput.test.tsx: existing 4 tests

## Progress

### Phase 1: Mode Selector + API

#### Automated

- [x] 1.1 `npm run build` passes
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run typecheck` passes
- [x] 1.4 `npm test` passes
- [x] 1.5 Mode tabs in JDInput
- [x] 1.6 `create.ts` handles `mode` field
- [x] 1.7 `generate.ts` skips extraction for tech stack mode

#### Manual

- [ ] 1.8 Tech stack fields swap on tab click
- [ ] 1.9 Submit tech stack → challenge generated without JD
- [ ] 1.10 JD mode unchanged (no regression)
- [ ] 1.11 Validation: disabled when fields empty
