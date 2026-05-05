# /diff-review

Open the native diff-review window and wait for submission.

Prefer using the structured tool `diff_review` when available.

Fallback command:
`npm run claude:review -- --output prompt`

If command execution is unavailable in this Claude environment, ask me to run this manually and paste the output.

When it returns, use the emitted prompt as review context and respond with:

- short risk summary
- prioritized findings (with file paths)
- concrete fix suggestions
