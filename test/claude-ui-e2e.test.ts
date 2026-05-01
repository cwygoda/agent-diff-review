import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  const repoRoot = mkdtempSync(join(tmpdir(), "agent-diff-review-claude-e2e-"));
  run("git", ["init"], repoRoot);
  run("git", ["config", "user.email", "e2e@example.com"], repoRoot);
  run("git", ["config", "user.name", "E2E"], repoRoot);
  writeFileSync(join(repoRoot, "a.ts"), "line1\nline2\n", "utf8");
  run("git", ["add", "a.ts"], repoRoot);
  run("git", ["commit", "-m", "init"], repoRoot);
  writeFileSync(join(repoRoot, "a.ts"), "line1\nline2 changed\n", "utf8");
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
  timeoutMs = 15000,
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

describe.skipIf(noTmux)("claude ui adapter tmux e2e", () => {
  test("mock submit prints composed prompt", async () => {
    const repoRoot = createFixtureRepo();
    const sessionName = `agent-diff-review-claude-${process.pid}-${Date.now()}`;
    const entry = resolve(process.cwd(), "src", "claude-ui.ts");

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
          `AGENT_DIFF_REVIEW_UI_ADAPTER=mock node --experimental-strip-types '${entry}' --output prompt`,
          "Enter",
        ],
        { encoding: "utf8" },
      );

      const pane = await waitForPaneOutput(sessionName, "Please address the following feedback");
      expect(pane).toContain("Please address the following feedback");
    } finally {
      try {
        execFileSync("tmux", ["kill-session", "-t", sessionName], { encoding: "utf8" });
      } catch {
        // best effort cleanup
      }
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 20000);

  test("mock cancel prints cancellation message", async () => {
    const repoRoot = createFixtureRepo();
    const sessionName = `agent-diff-review-claude-${process.pid}-${Date.now()}-cancel`;
    const entry = resolve(process.cwd(), "src", "claude-ui.ts");

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
          `AGENT_DIFF_REVIEW_UI_ADAPTER=mock AGENT_DIFF_REVIEW_MOCK_MODE=cancel node --experimental-strip-types '${entry}' --output prompt`,
          "Enter",
        ],
        { encoding: "utf8" },
      );

      const pane = await waitForPaneOutput(sessionName, "Review cancelled.");
      expect(pane).toContain("Review cancelled.");
    } finally {
      try {
        execFileSync("tmux", ["kill-session", "-t", sessionName], { encoding: "utf8" });
      } catch {
        // best effort cleanup
      }
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 20000);
});
