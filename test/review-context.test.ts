import { describe, expect, test } from "vitest";
import { buildReviewContextPrompt } from "../src/core/review-context.js";

describe("buildReviewContextPrompt", () => {
  test("uses CONTENT block when original and modified are identical", () => {
    const prompt = buildReviewContextPrompt("all-files", [
      { path: "a.ts", originalContent: "const a = 1;", modifiedContent: "const a = 1;" },
    ]);

    expect(prompt).toContain("--- CONTENT ---");
    expect(prompt).not.toContain("--- ORIGINAL ---");
    expect(prompt).not.toContain("--- MODIFIED ---");
  });

  test("marks truncated content", () => {
    const big = "a".repeat(60 * 1024);
    const prompt = buildReviewContextPrompt("git-diff", [
      { path: "big.ts", originalContent: big, modifiedContent: big + "b" },
    ]);

    expect(prompt).toContain("(truncated)");
  });
});
