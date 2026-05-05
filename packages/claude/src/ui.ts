#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { getReviewWindowData, loadReviewFileContents } from "@cwygoda/agent-diff-review-core/git";
import { parseMockSubmit } from "@cwygoda/agent-diff-review-core/mock-submit";
import { composeReviewPrompt } from "@cwygoda/agent-diff-review-core/prompt";
import { CliArgumentError, parseFlagArgs, requireStringFlag } from "@cwygoda/agent-diff-review-core/cli-args";
import { createCommandRunner } from "@cwygoda/agent-diff-review-core/runner";

type OutputMode = "prompt" | "json";

interface CliOptions {
  cwd: string;
  output: OutputMode;
  outFile: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const { flags, positionals } = parseFlagArgs(argv);
  if (positionals.length > 0) throw new CliArgumentError(`Unexpected positional arguments: ${positionals.join(" ")}`);
  const cwd = requireStringFlag(flags, "cwd") ?? process.cwd();
  const outputValue = requireStringFlag(flags, "output") ?? "prompt";
  if (outputValue !== "prompt" && outputValue !== "json") throw new CliArgumentError("--output must be prompt or json");
  const outFile = requireStringFlag(flags, "out");
  return { cwd, output: outputValue, outFile };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runner = createCommandRunner();
  const { repoRoot, files } = await getReviewWindowData(runner, options.cwd);
  if (files.length === 0) throw new Error("No reviewable files found.");

  if (process.env.AGENT_DIFF_REVIEW_UI_ADAPTER !== "mock") {
    throw new Error("Only AGENT_DIFF_REVIEW_UI_ADAPTER=mock is supported in this CLI");
  }

  const feedback = parseMockSubmit(files, process.env);
  if (feedback.type === "cancel") {
    process.stdout.write("Review cancelled.\n");
    return;
  }

  const enrichedFiles = await Promise.all(
    files.map(async (file) => ({
      ...file,
      ...(await loadReviewFileContents(runner, repoRoot, file, "git-diff")),
    })),
  );

  const prompt = composeReviewPrompt(enrichedFiles, feedback);
  const result = options.output === "prompt" ? prompt : JSON.stringify({ repoRoot, files: enrichedFiles, feedback, prompt }, null, 2);
  if (options.outFile != null) await writeFile(options.outFile, result, "utf8");
  process.stdout.write(`${result}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
