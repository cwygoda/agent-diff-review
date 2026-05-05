import type { ReviewCancelPayload, ReviewFile, ReviewScope, ReviewSubmitPayload } from "./types.js";

export function parseMockSubmit(
  files: ReviewFile[],
  env: NodeJS.ProcessEnv,
): ReviewSubmitPayload | ReviewCancelPayload {
  const mode = env.AGENT_DIFF_REVIEW_MOCK_MODE?.trim().toLowerCase();
  if (mode === "cancel") return { type: "cancel" };

  const submitJson = env.AGENT_DIFF_REVIEW_MOCK_SUBMIT_JSON;
  if (submitJson != null && submitJson.trim().length > 0) {
    return JSON.parse(submitJson) as ReviewSubmitPayload;
  }

  const file = files[0];
  if (file == null) return { type: "submit", overallComment: "", comments: [] };

  const scope: ReviewScope = file.inGitDiff
    ? "git-diff"
    : file.inLastCommit
      ? "last-commit"
      : "all-files";

  return {
    type: "submit",
    overallComment: "Mock review submission",
    comments: [
      {
        id: "mock-1",
        fileId: file.id,
        scope,
        side: "file",
        startLine: null,
        endLine: null,
        body: `Mock adapter comment for ${file.path}`,
      },
    ],
  };
}
