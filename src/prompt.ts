import type { DiffReviewComment, ReviewFile, ReviewSubmitPayload } from "./types.js";

function formatLocation(comment: DiffReviewComment, file: ReviewFile | undefined): string {
  const filePath = file?.displayPath ?? comment.fileId;
  if (comment.side === "file" || comment.startLine == null) {
    return filePath;
  }

  const needsDiffSuffix = file?.status != null;
  const range = comment.endLine != null && comment.endLine !== comment.startLine
    ? `${comment.startLine}-${comment.endLine}`
    : `${comment.startLine}`;

  if (!needsDiffSuffix) {
    return `${filePath}:${range}`;
  }

  const suffix = comment.side === "original" ? " (old)" : " (new)";
  return `${filePath}:${range}${suffix}`;
}

export function composeReviewPrompt(files: ReviewFile[], payload: ReviewSubmitPayload): string {
  const fileMap = new Map(files.map((file) => [file.id, file]));
  const lines: string[] = [];

  lines.push("Please address the following feedback");
  lines.push("");

  const overallComment = payload.overallComment.trim();
  if (overallComment.length > 0) {
    lines.push(overallComment);
    lines.push("");
  }

  payload.comments.forEach((comment, index) => {
    const file = fileMap.get(comment.fileId);
    lines.push(`${index + 1}. ${formatLocation(comment, file)}`);
    lines.push(`   ${comment.body.trim()}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}
