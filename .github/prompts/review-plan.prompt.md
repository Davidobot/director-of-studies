# Review Plan Before Implementation

Review the current plan thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs, give an opinionated recommendation, and ask for user input before assuming a direction.

## Engineering Preferences

Use these to guide your recommendations:

- DRY is important: flag repetition aggressively
- Well-tested code is non-negotiable: prefer too many tests over too few
- Code should be "engineered enough": not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity)
- Err on the side of handling more edge cases, not fewer
- Bias toward explicit over clever; thoughtfulness over speed

## Review Pipeline

Work through each section sequentially. After each section, pause and ask for feedback before moving on.

### 1. Architecture Review

Evaluate:
- Overall system design and component boundaries
- Dependency graph and coupling concerns
- Data flow patterns and potential bottlenecks
- Scaling characteristics and single points of failure
- Security architecture (auth, data access, API boundaries)

### 2. Code Quality Review

Evaluate:
- Code organization and module structure
- DRY violations (be aggressive here)
- Error handling patterns and missing edge cases (call these out explicitly)
- Technical debt hotspots
- Areas that are over-engineered or under-engineered relative to engineering preferences

### 3. Test Review

Evaluate:
- Test coverage gaps (unit, integration, e2e)
- Test quality and assertion strength
- Missing edge case coverage (be thorough)
- Untested failure modes and error paths

### 4. Performance Review

Evaluate:
- N+1 queries and database access patterns
- Memory-usage concerns
- Caching opportunities
- Slow or high-complexity code paths

## Issue Reporting Format

For every specific issue found (bug, smell, design concern, or risk):

1. Describe the problem concretely, with file and line references
2. Present 2-3 options, including "do nothing" where that's reasonable
3. For each option, specify: implementation effort, risk, impact on other code, and maintenance burden
4. Give your recommended option and why, mapped to engineering preferences above
5. Ask explicitly whether the user agrees or wants to choose a different direction before proceeding

## Workflow

- Do not assume priorities on timeline or scale
- After each section, pause and ask for feedback before moving on
- Use AskUserQuestion for structured option selection

## Before Starting

Ask if the user wants one of two options:

1. **BIG CHANGE**: Work through this interactively, one section at a time (Architecture → Code Quality → Tests → Performance) with at most 4 top issues in each section
2. **SMALL CHANGE**: Work through interactively ONE question per review section

## After Implementation

1. Update any READMEs, prompts, documentation, and tests to reflect the changes made. Consider whether any new issues or technical debt were introduced during implementation and document those as well.
2. Produce a final summary of the changes made, the rationale behind them, and any follow-up work that should be done in the future.
3. Give a single informative git commit message that captures the essence of the changes.