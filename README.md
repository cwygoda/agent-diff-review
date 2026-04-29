# Agent Diff Review

Based on the slop which is [pi-diff-review](https://github.com/badlogic/pi-diff-review), we added
more slop so you can review your slop!

Native diff review window for agents, powered by [Glimpse](https://github.com/hazat/glimpse) and
Monaco.

## Installation

Come back later.

### Build web assets

Web assets are built at install time via `prepare`.

To rebuild manually:

```bash
npm run build:web
```

## What it does

Adds a `/diff-review` command to your agent.

The command:

1. opens a native review window
2. lets you switch between `git diff`, `last commit`, and `all files` scopes
3. shows a collapsible sidebar with fuzzy file search
4. shows git status markers in the sidebar for changed files and untracked files
5. lazy-loads file contents on demand as you switch files and scopes
6. lets you draft comments on the original side, modified side, or whole file
7. inserts the resulting feedback prompt into the pi editor when you submit

## Requirements

- macOS, Linux, or Windows
- Node.js 20+

### Windows notes

Glimpse now supports Windows. To build the native host during install you need:

- .NET 8 SDK
- Microsoft Edge WebView2 Runtime

## Commit message convention

Releases are automated with semantic-release and follow [Conventional Commits](https://www.conventionalcommits.org/).

## Automated E2E testing

For CI-style E2E, you can replace the native webapp with a mock adapter.

```bash
AGENT_DIFF_REVIEW_UI_ADAPTER=mock pi --no-extensions -e ./src/index.ts
```

Optional mock controls:

- `AGENT_DIFF_REVIEW_MOCK_MODE=cancel` to simulate cancel
- `AGENT_DIFF_REVIEW_MOCK_SUBMIT_JSON='{"type":"submit","overallComment":"...","comments":[]}'` to inject a fixed submit payload
- `AGENT_DIFF_REVIEW_MOCK_DELAY_MS=250` to simulate async UI delay

This lets tmux drive `/diff-review` and assert that the resulting prompt is inserted into the pi editor without depending on native window automation.

Run the included Vitest E2E suite:

```bash
pnpm test
```

Included scenarios:

- mock submit inserts feedback into the harness
- mock cancel shows the cancellation notification
