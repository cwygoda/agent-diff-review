import type { ReviewFile, ReviewScope } from "./types.js";

export function fileInScope(file: ReviewFile, scope: ReviewScope): boolean {
  if (scope === "all-files") return true;
  if (scope === "git-diff") return file.inGitDiff;
  return file.inLastCommit;
}

export function buildReviewContextPrompt(
  scope: ReviewScope,
  files: Array<{ path: string; originalContent: string; modifiedContent: string }>,
): string {
  const header = [
    "You are reviewing code changes.",
    `Scope: ${scope}`,
    "Provide actionable feedback with file paths and line ranges when possible.",
    "",
  ];

  const body: string[] = [];
  for (const file of files) {
    body.push(`### File: ${file.path}`);
    body.push("--- ORIGINAL ---");
    body.push(file.originalContent || "(empty)");
    body.push("--- MODIFIED ---");
    body.push(file.modifiedContent || "(empty)");
    body.push("");
  }

  return [...header, ...body].join("\n").trim();
}
