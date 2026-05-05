import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

function hasBinary(name: string): boolean {
  return spawnSync("which", [name], { stdio: "ignore" }).status === 0;
}

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function createFixtureRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "agent-diff-review-cli-e2e-"));
  run("git", ["init"], repoRoot);
  run("git", ["config", "user.email", "e2e@example.com"], repoRoot);
  run("git", ["config", "user.name", "E2E"], repoRoot);
  writeFileSync(join(repoRoot, "a.ts"), "const a = 1;\n", "utf8");
  run("git", ["add", "a.ts"], repoRoot);
  run("git", ["commit", "-m", "init"], repoRoot);
  writeFileSync(join(repoRoot, "a.ts"), "const a = 2;\n", "utf8");
  return repoRoot;
}

function capturePane(sessionName: string): string {
  return execFileSync("tmux", ["capture-pane", "-p", "-S", "-300", "-t", sessionName], {
    encoding: "utf8",
  });
}

async function waitForPaneOutput(
  sessionName: string,
  includes: string,
  timeoutMs = 10000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = capturePane(sessionName);
    if (last.includes(includes)) return last;
    await sleep(250);
  }
  return last;
}

const noTmux = !hasBinary("tmux");

describe.skipIf(noTmux)("cli tmux e2e", () => {
  test("outputs prompt", async () => {
    const repoRoot = createFixtureRepo();
    const sessionName = `agent-diff-review-cli-${process.pid}-${Date.now()}`;
    const cliPath = resolve(process.cwd(), "packages", "claude", "src", "cli.ts");

    try {
      execFileSync("tmux", ["new-session", "-d", "-s", sessionName, "-c", repoRoot], {
        encoding: "utf8",
      });
      await sleep(250);
      execFileSync(
        "tmux",
        [
          "send-keys",
          "-t",
          sessionName,
          `node --experimental-strip-types '${cliPath}' --output prompt --scope git-diff`,
          "Enter",
        ],
        { encoding: "utf8" },
      );

      const pane = await waitForPaneOutput(sessionName, "You are reviewing code changes.");
      expect(pane).toContain("You are reviewing code changes.");
      expect(pane).toContain("### File: a.ts");
    } finally {
      try {
        execFileSync("tmux", ["kill-session", "-t", sessionName], { encoding: "utf8" });
      } catch {
        // ignore cleanup errors
      }
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 20000);

  test("outputs json and writes file", async () => {
    const repoRoot = createFixtureRepo();
    const sessionName = `agent-diff-review-cli-${process.pid}-${Date.now()}-json`;
    const cliPath = resolve(process.cwd(), "packages", "claude", "src", "cli.ts");
    const outPath = join(repoRoot, "review.json");

    try {
      execFileSync("tmux", ["new-session", "-d", "-s", sessionName, "-c", repoRoot], {
        encoding: "utf8",
      });
      await sleep(250);
      execFileSync(
        "tmux",
        [
          "send-keys",
          "-t",
          sessionName,
          `node --experimental-strip-types '${cliPath}' --output json --scope git-diff --out '${outPath}'`,
          "Enter",
        ],
        { encoding: "utf8" },
      );

      const pane = await waitForPaneOutput(sessionName, '"scope": "git-diff"');
      expect(pane).toContain('"scope": "git-diff"');
      const fileJson = readFileSync(outPath, "utf8");
      expect(fileJson).toContain('"fileCount"');
    } finally {
      try {
        execFileSync("tmux", ["kill-session", "-t", sessionName], { encoding: "utf8" });
      } catch {
        // ignore cleanup errors
      }
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 20000);
});
