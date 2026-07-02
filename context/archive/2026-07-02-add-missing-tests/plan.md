# Add Missing Tests — Implementation Plan

## Phase 1: AI Functions

### evaluateAnswer tests

**File**: `src/lib/ai.test.ts` (add to existing)

Mock `generateText` to return controlled responses. Test:
- Strong answer parsing (quality:"strong", confidence, rationale)
- Weak answer parsing
- Markdown fence stripping in response
- Prompt includes constraints (role, domain, tech_stack)

### generateChallenge tests

**File**: `src/lib/ai.test.ts` (add to existing)

Test:
- Challenge text returned
- previousTopics included in prompt when provided
- No "return ONLY" preamble in output

### generateSummary tests

**File**: `src/lib/ai.test.ts` (add to existing)

Test:
- Parsing strengths/improvement_areas as arrays
- quality field ("strong"|"mixed")
- Empty improvement_areas allowed

## Phase 2: Auto-Complete Logic

**File**: `src/lib/auto-complete.test.ts` (new)

Extract the consecutive-strong check into a pure function, then test:
- 3 consecutive strong → true
- 2 strong + 1 weak → false
- Less than 3 answers → false
- Empty → false

## Success Criteria

- All tests pass, build/typecheck/lint pass
- AI functions: 6+ new tests
- Auto-complete: 4+ new tests

## Progress

### Phase 1: AI Functions

- [ ] 1.1 evaluateAnswer tests
- [ ] 1.2 generateChallenge tests
- [ ] 1.3 generateSummary tests

### Phase 2: Auto-Complete

- [ ] 2.1 Extract check + tests
- [ ] 2.2 Build / typecheck / lint / test pass
