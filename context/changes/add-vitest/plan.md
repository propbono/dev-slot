# Add Vitest — Implementation Plan

## Overview

Set up Vitest as the project's test framework with co-located test files, a unit test for the AI service extraction logic (mocked DeepSeek), and CI integration.

## Current State Analysis

- No test framework installed — AGENTS.md says "add one before writing test files"
- GitHub Actions CI runs lint + build on push/PR to `main`
- AI service (`src/lib/ai.ts`) has extractConstraints() with JSON parsing + markdown stripping — highest-value logic to test
- `@ai-sdk/deepseek` is already a dependency — can be mocked

## Desired End State

`npm test` runs Vitest, finds and executes co-located `*.test.ts` files. One example test covers the extraction logic with a mocked DeepSeek response. CI includes the test step. AGENTS.md updated with test command.

## What We're NOT Doing

- No integration tests hitting real APIs
- No coverage threshold enforcement yet
- No E2E or browser tests
- No test for every existing module — starting with one example

## Implementation Approach

Single phase: install + config + example test + CI update.

Co-located test files: `src/lib/ai.test.ts` alongside `src/lib/ai.ts`. Vitest config resolves `@/*` path alias and covers `src/**/*.test.ts`.

Mock strategy: mock `generateText` from `ai` package. Test verifies that valid JSON is parsed correctly and markdown fences are stripped.

## Phase 1: Setup + Example Test

### Changes Required:

#### 1. Install Vitest

**File**: `package.json`

**Intent**: Add `vitest` and `@vitest/coverage-v8` as devDependencies. Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts.

**Contract**: `npm install -D vitest @vitest/coverage-v8`. Update scripts.

#### 2. Vitest config

**File**: `vitest.config.ts`

**Intent**: Configure Vitest to resolve the `@/*` path alias (matching tsconfig.json), use jsdom environment for React components, and discover co-located `*.test.ts` files.

**Contract**:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

#### 3. Example test — AI extraction

**File**: `src/lib/ai.test.ts`

**Intent**: Unit test for `extractConstraints()`. Mock `generateText` from `ai` to return a controlled JSON response. Test happy path (valid JSON parsing), markdown fence stripping, and the `ExtractionError` thrown on invalid JSON.

**Contract**:
```ts
import { describe, it, expect, vi } from "vitest";
import { extractConstraints } from "./ai";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

describe("extractConstraints", () => {
  it("parses valid JSON response", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '{"tech_stack":["React","AWS"],"role_level":"Staff","domain":"Fintech"}',
      // other fields omitted — generateText returns more, but we only use .text
    } as any);

    const result = await extractConstraints("Fake JD");
    expect(result).toEqual({
      tech_stack: ["React", "AWS"],
      role_level: "Staff",
      domain: "Fintech",
    });
  });

  it("strips markdown fences", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '```json\n{"tech_stack":["Go"],"role_level":"Senior","domain":"SaaS"}\n```',
    } as any);

    const result = await extractConstraints("Fake JD");
    expect(result.tech_stack).toEqual(["Go"]);
  });

  it("throws ExtractionError on invalid JSON", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: "not json at all",
    } as any);

    await expect(extractConstraints("Fake JD")).rejects.toThrow("Failed to parse extraction JSON");
  });
});
```

#### 4. Update AGENTS.md

**File**: `AGENTS.md`

**Intent**: Replace the placeholder "No test runner configured yet" with actual test commands and conventions.

**Contract**: Update the Testing section to:
```
- `npm test` — Run all tests (Vitest)
- `npm run test:watch` — Watch mode
- Test files are co-located: `src/**/*.test.ts`
- Mock external API calls; don't hit real APIs in unit tests
```

#### 5. Update CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Add `npm test` step after `npm run build`.

**Contract**: Add `- run: npm test` after the build step. Tests need the same env vars as build (no real API calls, but Vitest may resolve modules that import from astro:env/server).

### Success Criteria:

#### Automated:

- `npm test` passes (3 tests)
- `npm run build` passes (no regressions)
- `npm run lint` passes
- `vitest.config.ts` exists
- `src/lib/ai.test.ts` exists
- CI workflow includes test step

#### Manual:

- Verify tests run in watch mode: `npm run test:watch`

---

## Testing Strategy

The test itself is the deliverable. Running `npm test` verifies:
- Extract works with clean JSON
- Markdown fences are stripped
- Invalid JSON throws ExtractionError

## References

- AGENTS.md Testing section
- AI service: `src/lib/ai.ts`
- CI workflow: `.github/workflows/ci.yml`

## Progress

### Phase 1: Setup + Example Test

#### Automated

- [x] 1.1 `npm test` passes
- [x] 1.2 `npm run build` passes
- [x] 1.3 `npm run lint` passes
- [x] 1.4 `vitest.config.ts` exists
- [x] 1.5 `src/lib/ai.test.ts` exists
- [x] 1.6 CI workflow includes test step

#### Manual

- [x] 1.7 Test watch mode works
