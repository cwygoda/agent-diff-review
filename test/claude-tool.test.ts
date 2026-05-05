import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" });
}

function createFixtureRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "agent-diff-review-tool-"));
  run("git", ["init"], repoRoot);
  run("git", ["config", "user.email", "e2e@example.com"], repoRoot);
  run("git", ["config", "user.name", "E2E"], repoRoot);
  writeFileSync(join(repoRoot, "a.ts"), "const a = 1;\n", "utf8");
  run("git", ["add", "a.ts"], repoRoot);
  run("git", ["commit", "-m", "init"], repoRoot);
  writeFileSync(join(repoRoot, "a.ts"), "const a = 2;\n", "utf8");
  return repoRoot;
}

describe("claude tool", () => {
  test("returns structured json", () => {
    const repoRoot = createFixtureRepo();
    const entry = new URL("../packages/claude/src/claude-tool.ts", import.meta.url);

    try {
      const output = execFileSync("node", ["--experimental-strip-types", entry.pathname], {
        cwd: repoRoot,
        encoding: "utf8",
        input: JSON.stringify({ tool: "diff_review", input: { scope: "git-diff" } }),
      });

      const parsed = JSON.parse(output) as {
        ok: boolean;
        result?: { fileCount: number; prompt: string };
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.result?.fileCount).toBeGreaterThan(0);
      expect(parsed.result?.prompt).toContain("You are reviewing code changes.");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test("rejects non-object input", () => {
    const repoRoot = createFixtureRepo();
    const entry = new URL("../packages/claude/src/claude-tool.ts", import.meta.url);

    try {
      expect(() =>
        execFileSync("node", ["--experimental-strip-types", entry.pathname], {
          cwd: repoRoot,
          encoding: "utf8",
          input: "null",
        }),
      ).toThrow();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
