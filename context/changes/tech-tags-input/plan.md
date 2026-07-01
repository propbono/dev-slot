# Tech Tags Input — Implementation Plan

## Overview

Add an optional "Focus Areas" field to the Tech Stack mode that lets users specify topics to focus the challenge on (FR-006). Tags are passed through to the challenge generation prompt.

## Current State

- Tech Stack mode exists (FR-004) with technologies, role, domain
- create.ts stores tech stack data in system message
- generate.ts builds constraints from tech stack input and generates challenge

## Changes

### 1. JDInput — add tags field

**File**: `src/components/interview/JDInput.tsx`

**Intent**: Add a "Focus Areas" text input in the tech stack mode section, between domain and the submit button.

**Contract**: `<input name="tags" placeholder="e.g., event sourcing, distributed transactions" />` — optional, no validation.

### 2. create.ts — store tags

**File**: `src/pages/api/interview/create.ts`

**Intent**: Read `tags` from form data and include in the system message.

**Contract**: `tags: (form.get("tags") as string)?.trim() || ""` added to system message JSON.

### 3. generate.ts — include tags in prompt

**File**: `src/pages/api/interview/generate.ts`

**Intent**: When building the synthetic JD for tech stack mode, append focus areas.

**Contract**: If `systemContent.tags` exists and is non-empty, append to JD: `"Focus the challenge on these topics: ${tags}."`

### Success Criteria:

#### Automated:

- Build, lint, typecheck, tests pass
- Tags field visible in tech stack mode

#### Manual:

- Enter tags in tech stack mode → challenge references the tags
- Leave tags empty → challenge generated normally (no regression)

## Progress

### Phase 1: Tags Field

#### Automated

- [x] 1.1 `npm run build` passes — 9f4e1f9
- [x] 1.2 `npm run lint` passes — 9f4e1f9
- [x] 1.3 `npm run typecheck` passes — 9f4e1f9
- [x] 1.4 `npm test` passes — 9f4e1f9
- [x] 1.5 Tags field in JDInput — 9f4e1f9
- [x] 1.6 create.ts stores tags — 9f4e1f9
- [x] 1.7 generate.ts includes tags in prompt — 9f4e1f9

#### Manual

- [x] 1.8 Tags influence the generated challenge — 9f4e1f9
- [x] 1.9 No regression when tags empty — 9f4e1f9
