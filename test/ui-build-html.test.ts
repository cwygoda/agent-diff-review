import { describe, expect, test } from "vitest";
import { buildReviewHtml } from "../src/ui.js";
import type { ReviewWindowData } from "../src/core/types.js";

function extractReviewDataJson(html: string): string {
  const match = html.match(
    /<script id="diff-review-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/,
  );
  if (!match || !match[1]) {
    throw new Error("diff-review-data script block not found");
  }
  return match[1];
}

function extractAppJsSrc(html: string): string {
  const match = html.match(/<script src="([^"]+)"><\/script>/);
  if (!match || !match[1]) {
    throw new Error("app script src not found");
  }
  return match[1];
}

describe("buildReviewHtml", () => {
  test("inlines payload with changed files metadata", () => {
    const data: ReviewWindowData = {
      repoRoot: "/tmp/repo",
      files: [
        {
          id: "f1",
          path: "src/example.ts",
          worktreeStatus: "modified",
          hasWorkingTreeFile: true,
          inGitDiff: true,
          inLastCommit: false,
          gitDiff: {
            status: "modified",
            oldPath: "src/example.ts",
            newPath: "src/example.ts",
            displayPath: "src/example.ts",
            hasOriginal: true,
            hasModified: true,
          },
          lastCommit: null,
        },
      ],
    };

    const html = buildReviewHtml(data);

    expect(html).not.toContain(
      '<script id="diff-review-data" type="application/json">\n      __INLINE_DATA__',
    );
    expect(html).not.toContain("<style>\n      __INLINE_CSS__");
    expect(html).not.toContain("<script>\n      __INLINE_JS__;");

    const appJsSrc = extractAppJsSrc(html);
    expect(appJsSrc).toBeTruthy();
    expect(appJsSrc).not.toContain("__APP_JS_SRC__");

    const json = extractReviewDataJson(html);
    const parsed = JSON.parse(json) as ReviewWindowData;

    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]?.path).toBe("src/example.ts");
    expect(parsed.files[0]?.inGitDiff).toBe(true);
  });
});
