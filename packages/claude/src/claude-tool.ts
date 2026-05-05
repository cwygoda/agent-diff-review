#!/usr/bin/env node
import { stdin as input } from "node:process";
import { getReviewWindowData, loadReviewFileContents } from "@cwygoda/agent-diff-review-core/git";
import { buildReviewContextPrompt, fileInScope } from "@cwygoda/agent-diff-review-core/review-context";
import { createCommandRunner } from "@cwygoda/agent-diff-review-core/runner";
import type { ReviewScope } from "@cwygoda/agent-diff-review-core/types";

interface ToolInput {
  cwd?: string;
  scope?: ReviewScope;
}

interface ToolRequest {
  tool: "diff_review";
  input?: ToolInput;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

function parseRequest(raw: string): ToolRequest {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Invalid request JSON: expected an object");
  }

  const request = parsed as ToolRequest;
  if (request.tool !== "diff_review") {
    throw new Error("Unsupported tool. Expected tool=diff_review");
  }
  return request;
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (raw.length === 0) {
    throw new Error("Expected JSON request on stdin");
  }

  const request = parseRequest(raw);
  const cwd = request.input?.cwd ?? process.cwd();
  const scope = request.input?.scope ?? "git-diff";

  const runner = createCommandRunner();
  const { repoRoot, files } = await getReviewWindowData(runner, cwd);
  const selectedFiles = files.filter((file) => fileInScope(file, scope));

  const hydrated = await Promise.all(
    selectedFiles.map(async (file) => ({
      file,
      contents: await loadReviewFileContents(runner, repoRoot, file, scope),
    })),
  );

  const prompt = buildReviewContextPrompt(
    scope,
    hydrated.map(({ file, contents }) => ({
      path: file.path,
      originalContent: contents.originalContent,
      modifiedContent: contents.modifiedContent,
    })),
  );

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      result: {
        repoRoot,
        scope,
        fileCount: hydrated.length,
        files: hydrated.map(({ file, contents }) => ({ ...file, ...contents })),
        prompt,
      },
    })}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
});
