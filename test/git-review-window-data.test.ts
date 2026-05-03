import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { getReviewWindowData, loadReviewFileContents } from "../src/core/git.js";

const execFileAsync = promisify(execFile);

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await execFileAsync(command, args, { cwd });
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface PiLike {
  exec(command: string, args: string[], options: { cwd: string }): Promise<ExecResult>;
}

function createPiLike(): PiLike {
  return {
    async exec(command: string, args: string[], options: { cwd: string }): Promise<ExecResult> {
      try {
        const { stdout, stderr } = await execFileAsync(command, args, { cwd: options.cwd });
        return {
          code: 0,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        };
      } catch (error) {
        const err = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        return {
          code: typeof err.code === "number" ? err.code : 1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
        };
      }
    },
  };
}

const repoDirs: string[] = [];

afterEach(() => {
  for (const dir of repoDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function createFixtureRepo(): Promise<string> {
  const repoRoot = mkdtempSync(join(tmpdir(), "agent-diff-review-git-"));
  repoDirs.push(repoRoot);

  await run("git", ["init"], repoRoot);
  await run("git", ["config", "user.email", "e2e@example.com"], repoRoot);
  await run("git", ["config", "user.name", "E2E"], repoRoot);

  writeFileSync(join(repoRoot, "tracked.ts"), "const a = 1;\n", "utf8");
  await run("git", ["add", "tracked.ts"], repoRoot);
  await run("git", ["commit", "-m", "init"], repoRoot);

  writeFileSync(join(repoRoot, "tracked.ts"), "const a = 2;\n", "utf8");
  writeFileSync(join(repoRoot, "new-file.ts"), "export const b = 1;\n", "utf8");

  return repoRoot;
}

describe("getReviewWindowData", () => {
  test("includes modified and untracked files for git diff scope", async () => {
    const repoRoot = await createFixtureRepo();
    const pi = createPiLike();

    const data = await getReviewWindowData(pi, repoRoot);

    expect(data.repoRoot.endsWith(repoRoot)).toBe(true);
    expect(data.files.length).toBeGreaterThanOrEqual(2);

    const modified = data.files.find((file) => file.path === "tracked.ts");
    const untracked = data.files.find((file) => file.path === "new-file.ts");

    expect(modified).toBeDefined();
    expect(modified?.inGitDiff).toBe(true);
    expect(modified?.gitDiff?.status).toBe("modified");

    expect(untracked).toBeDefined();
    expect(untracked?.inGitDiff).toBe(true);
    expect(untracked?.gitDiff?.status).toBe("added");
  });

  test("last-commit scope handles single-commit repositories without HEAD^", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "agent-diff-review-git-single-"));
    repoDirs.push(repoRoot);

    await run("git", ["init"], repoRoot);
    await run("git", ["config", "user.email", "e2e@example.com"], repoRoot);
    await run("git", ["config", "user.name", "E2E"], repoRoot);

    writeFileSync(join(repoRoot, "first.ts"), "export const first = 1;\n", "utf8");
    await run("git", ["add", "first.ts"], repoRoot);
    await run("git", ["commit", "-m", "first"], repoRoot);

    const pi = createPiLike();
    const data = await getReviewWindowData(pi, repoRoot);
    const firstFile = data.files.find((file) => file.path === "first.ts");

    expect(firstFile).toBeDefined();
    if (firstFile == null) return;

    const contents = await loadReviewFileContents(pi, repoRoot, firstFile, "last-commit");
    expect(contents.originalContent).toBe("");
    expect(contents.modifiedContent).toContain("export const first = 1;");
  });
});
