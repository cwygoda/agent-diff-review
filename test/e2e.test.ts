import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

function hasBinary(name: string): boolean {
  const result = spawnSync("which", [name], { stdio: "ignore" });
  return result.status === 0;
}

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function createFixtureRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "agent-diff-review-e2e-"));

  run("git", ["init"], repoRoot);
  run("git", ["config", "user.email", "e2e@example.com"], repoRoot);
  run("git", ["config", "user.name", "E2E"], repoRoot);

  writeFileSync(join(repoRoot, "a.ts"), "line1\nline2\n", "utf8");
  run("git", ["add", "a.ts"], repoRoot);
  run("git", ["commit", "-m", "init"], repoRoot);

  writeFileSync(join(repoRoot, "a.ts"), "line1\nline2 changed\nline3\n", "utf8");
  return repoRoot;
}

function capturePane(sessionName: string): string {
  return execFileSync("tmux", ["capture-pane", "-p", "-S", "-300", "-t", sessionName], {
    encoding: "utf8",
  });
}

async function waitForPaneOutput(
  sessionName: string,
  matcher: (paneText: string) => boolean,
  timeoutMs = 15000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastPane = "";

  while (Date.now() < deadline) {
    lastPane = capturePane(sessionName);
    if (matcher(lastPane)) return lastPane;
    await sleep(300);
  }

  return lastPane;
}

interface ScenarioOptions {
  mockMode?: "cancel";
}

const testDir = dirname(fileURLToPath(import.meta.url));

async function runPiTmuxScenario(options: ScenarioOptions = {}): Promise<string> {
  const projectRoot = resolve(testDir, "..");
  const extensionEntry = resolve(projectRoot, "src", "index.ts");
  const repoRoot = createFixtureRepo();
  const sessionName = `agent-diff-review-vitest-${process.pid}-${Date.now()}`;

  const envPrefix = [
    "AGENT_DIFF_REVIEW_UI_ADAPTER=mock",
    options.mockMode != null ? `AGENT_DIFF_REVIEW_MOCK_MODE=${options.mockMode}` : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  const quotedExtensionEntry = extensionEntry.replace(/'/g, `'"'"'`);
  const launchCommand = `${envPrefix} pi --no-extensions -e '${quotedExtensionEntry}'`;

  try {
    execFileSync("tmux", ["new-session", "-d", "-s", sessionName, "-c", repoRoot, launchCommand], {
      encoding: "utf8",
    });

    await waitForPaneOutput(
      sessionName,
      (text) => text.includes("Press ctrl+o") || text.includes("/ commands"),
      20000,
    );
    await sleep(500);
    execFileSync("tmux", ["send-keys", "-t", sessionName, "/diff-review", "Enter"], {
      encoding: "utf8",
    });

    const pane = await waitForPaneOutput(
      sessionName,
      (text) =>
        text.includes("Inserted review feedback into the editor.") ||
        text.includes("Review cancelled."),
      20000,
    );

    return pane;
  } finally {
    try {
      execFileSync("tmux", ["kill-session", "-t", sessionName], { encoding: "utf8" });
    } catch {
      // best effort cleanup
    }
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

const noTmux = !hasBinary("tmux");
const noPi = !hasBinary("pi");

describe.skipIf(noTmux || noPi)("pi mock adapter E2E", () => {
  test("submit flow inserts feedback into editor", async () => {
    const pane = await runPiTmuxScenario();
    expect(pane).toContain("Inserted review feedback into the editor.");
  }, 30000);

  test("cancel flow notifies review cancelled", async () => {
    const pane = await runPiTmuxScenario({ mockMode: "cancel" });
    expect(pane).toContain("Review cancelled.");
  }, 30000);
});
