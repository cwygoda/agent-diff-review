# Claude Code adapter

Use the CLI to open the native review UI and emit a prompt (or JSON payload) for Claude.

## Open native review UI + emit prompt

```bash
npm run claude:review -- --output prompt
```

## Open native review UI + emit JSON

```bash
npm run claude:review -- --output json
```

## Write to file

```bash
npm run claude:review -- --output prompt --out /tmp/review-prompt.txt
```

## Typical Claude workflow

```bash
npm run claude:review -- --output prompt > /tmp/review-prompt.txt
claude --prompt-file /tmp/review-prompt.txt
```

Options:

- `--cwd <path>` repo path (default: current dir)
- `--output prompt|json`
- `--out <file>` additionally write output to file

For automated tests/headless runs, use:

```bash
AGENT_DIFF_REVIEW_UI_ADAPTER=mock npm run claude:review -- --output prompt
```

## Claude slash-command execution mode

This repo expects Claude custom commands to run shell commands from `.claude/commands/*.md`.
If your Claude setup is instruction-only, run this manually:

```bash
npm run claude:review -- --output prompt
```

then paste the output into Claude.
