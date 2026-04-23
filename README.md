# Agent Diff Review

Based on the slop which is [pi-diff-review](https://github.com/badlogic/pi-diff-review), we added
more slop so you can review your slop!

Native diff review window for agents, powered by [Glimpse](https://github.com/hazat/glimpse) and
Monaco.

## Installation

Come back later.

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
- internet access for the Tailwind and Monaco CDNs used by the review window

### Windows notes

Glimpse now supports Windows. To build the native host during install you need:

- .NET 8 SDK
- Microsoft Edge WebView2 Runtime
