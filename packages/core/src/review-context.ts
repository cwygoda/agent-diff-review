import type { ReviewFile, ReviewScope } from "./types.js";

const MAX_FILE_CONTENT_BYTES = 50 * 1024;
const MAX_PROMPT_BYTES = 500 * 1024;

function truncateToByteLimit(
  content: string,
  limitBytes: number,
): { text: string; truncated: boolean } {
  if (limitBytes <= 0) return { text: "", truncated: content.length > 0 };
  const totalBytes = Buffer.byteLength(content, "utf8");
  if (totalBytes <= limitBytes) return { text: content, truncated: false };

  let low = 0;
  let high = content.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = content.slice(0, mid);
    if (Buffer.byteLength(slice, "utf8") <= limitBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return { text: content.slice(0, low), truncated: true };
}

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
    const sameContent = file.originalContent === file.modifiedContent;
    const original = truncateToByteLimit(file.originalContent || "(empty)", MAX_FILE_CONTENT_BYTES);
    const modified = sameContent
      ? original
      : truncateToByteLimit(file.modifiedContent || "(empty)", MAX_FILE_CONTENT_BYTES);

    body.push(`### File: ${file.path}`);
    if (sameContent) {
      body.push("--- CONTENT ---");
      body.push(original.text);
      if (original.truncated) body.push("(truncated)");
    } else {
      body.push("--- ORIGINAL ---");
      body.push(original.text);
      if (original.truncated) body.push("(truncated)");
      body.push("--- MODIFIED ---");
      body.push(modified.text);
      if (modified.truncated) body.push("(truncated)");
    }
    body.push("");
  }

  const prompt = [...header, ...body].join("\n").trim();
  const limited = truncateToByteLimit(prompt, MAX_PROMPT_BYTES);
  if (!limited.truncated) return limited.text;
  return `${limited.text}\n\n(truncated)`;
}
