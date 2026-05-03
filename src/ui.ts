#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { open } from "glimpseui";
import { getReviewWindowData, loadReviewFileContents } from "./core/git.ts";
import { parseMockSubmit } from "./core/mock-submit.ts";
import { composeReviewPrompt } from "./core/prompt.ts";
import type {
  ReviewCancelPayload,
  ReviewFile,
  ReviewHostMessage,
  ReviewRequestFilePayload,
  ReviewScope,
  ReviewSubmitPayload,
  ReviewWindowMessage,
} from "./core/types.ts";
import { CliArgumentError, parseFlagArgs, requireStringFlag } from "./core/cli-args.ts";
import { createCommandRunner } from "./core/runner.ts";
import { buildReviewHtml } from "./review-html.ts";

type OutputMode = "prompt" | "json";

interface CliOptions {
  cwd: string;
  output: OutputMode;
  outFile: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const { flags, positionals } = parseFlagArgs(argv);
  if (positionals.length > 0) {
    throw new CliArgumentError(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  const cwd = requireStringFlag(flags, "cwd") ?? process.cwd();

  const outputValue = requireStringFlag(flags, "output") ?? "prompt";
  if (outputValue !== "prompt" && outputValue !== "json") {
    throw new CliArgumentError("--output must be prompt or json");
  }

  const outFile = requireStringFlag(flags, "out");

  if (flags.has("help")) {
    process.stdout.write(
      "Usage: agent-diff-review [--cwd PATH] [--output prompt|json] [--out FILE]\n",
    );
    process.exit(0);
  }

  return { cwd, output: outputValue, outFile };
}

function isSubmitPayload(value: ReviewWindowMessage): value is ReviewSubmitPayload {
  return value.type === "submit";
}

function isCancelPayload(value: ReviewWindowMessage): value is ReviewCancelPayload {
  return value.type === "cancel";
}

function isRequestFilePayload(value: ReviewWindowMessage): value is ReviewRequestFilePayload {
  return value.type === "request-file";
}

function escapeForInlineScript(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

async function collectNativeFeedback(input: {
  repoRoot: string;
  files: ReviewFile[];
  loadContents: (
    file: ReviewFile,
    scope: ReviewScope,
  ) => Promise<{ originalContent: string; modifiedContent: string }>;
}): Promise<ReviewSubmitPayload | ReviewCancelPayload | null> {
  const html = buildReviewHtml({ repoRoot: input.repoRoot, files: input.files });
  const window = open(html, { width: 1680, height: 1020, title: "diff review" });
  const fileMap = new Map(input.files.map((file) => [file.id, file]));

  const sendWindowMessage = (message: ReviewHostMessage): void => {
    const payload = escapeForInlineScript(JSON.stringify(message));
    window.send(`window.__reviewReceive(${payload});`);
  };

  return await new Promise<ReviewSubmitPayload | ReviewCancelPayload | null>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      window.removeListener("message", onMessage);
      window.removeListener("closed", onClosed);
      window.removeListener("error", onError);
    };
    const settle = (value: ReviewSubmitPayload | ReviewCancelPayload | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        window.close();
      } catch {
        // at least we tried...
      }
      resolve(value);
    };

    const onMessage = (data: unknown): void => {
      const message = data as ReviewWindowMessage;
      if (isRequestFilePayload(message)) {
        const file = fileMap.get(message.fileId);
        if (file == null) {
          sendWindowMessage({
            type: "file-error",
            requestId: message.requestId,
            fileId: message.fileId,
            scope: message.scope,
            message: "Unknown file requested.",
          });
          return;
        }

        void input
          .loadContents(file, message.scope)
          .then((contents) => {
            sendWindowMessage({
              type: "file-data",
              requestId: message.requestId,
              fileId: message.fileId,
              scope: message.scope,
              originalContent: contents.originalContent,
              modifiedContent: contents.modifiedContent,
            });
          })
          .catch((error: unknown) => {
            const text = error instanceof Error ? error.message : String(error);
            sendWindowMessage({
              type: "file-error",
              requestId: message.requestId,
              fileId: message.fileId,
              scope: message.scope,
              message: text,
            });
          });
        return;
      }

      if (isSubmitPayload(message) || isCancelPayload(message)) {
        settle(message);
      }
    };

    const onClosed = (): void => settle(null);
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    window.on("message", onMessage);
    window.on("closed", onClosed);
    window.on("error", onError);
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runner = createCommandRunner();
  const { repoRoot, files } = await getReviewWindowData(runner, options.cwd);
  if (files.length === 0) throw new Error("No reviewable files found.");

  const feedback =
    process.env.AGENT_DIFF_REVIEW_UI_ADAPTER === "mock"
      ? parseMockSubmit(files, process.env)
      : await collectNativeFeedback({
          repoRoot,
          files,
          loadContents: (file, scope) => loadReviewFileContents(runner, repoRoot, file, scope),
        });

  if (feedback == null || feedback.type === "cancel") {
    process.stdout.write("Review cancelled.\n");
    return;
  }

  const prompt = composeReviewPrompt(files, feedback);
  const result =
    options.output === "prompt"
      ? prompt
      : JSON.stringify({ repoRoot, files, feedback, prompt }, null, 2);

  if (options.outFile != null) await writeFile(options.outFile, result, "utf8");
  process.stdout.write(`${result}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
