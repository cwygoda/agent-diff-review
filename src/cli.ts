#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { getReviewWindowData, loadReviewFileContents } from "./core/git.ts";
import { CliArgumentError, parseFlagArgs, requireStringFlag } from "./core/cli-args.ts";
import { buildReviewContextPrompt, fileInScope } from "./core/review-context.ts";
import { createCommandRunner } from "./core/runner.ts";
import type { ReviewScope } from "./core/types.ts";

type OutputMode = "prompt" | "json";

interface CliOptions {
  cwd: string;
  output: OutputMode;
  scope: ReviewScope;
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

  const scopeValue = requireStringFlag(flags, "scope") ?? "git-diff";
  if (scopeValue !== "git-diff" && scopeValue !== "last-commit" && scopeValue !== "all-files") {
    throw new CliArgumentError("--scope must be git-diff, last-commit, or all-files");
  }

  const outFile = requireStringFlag(flags, "out");

  if (flags.has("help")) {
    process.stdout.write(
      "Usage: node --experimental-strip-types src/cli.ts [--cwd PATH] [--scope git-diff|last-commit|all-files] [--output prompt|json] [--out FILE]\n",
    );
    process.exit(0);
  }

  return { cwd, output: outputValue, scope: scopeValue, outFile };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runner = createCommandRunner();
  const { repoRoot, files } = await getReviewWindowData(runner, options.cwd);
  const selectedFiles = files.filter((file) => fileInScope(file, options.scope));

  const hydrated = await Promise.all(
    selectedFiles.map(async (file) => ({
      file,
      contents: await loadReviewFileContents(runner, repoRoot, file, options.scope),
    })),
  );

  const prompt = buildReviewContextPrompt(
    options.scope,
    hydrated.map(({ file, contents }) => ({
      path: file.path,
      originalContent: contents.originalContent,
      modifiedContent: contents.modifiedContent,
    })),
  );

  const result =
    options.output === "prompt"
      ? prompt
      : JSON.stringify(
          {
            repoRoot,
            scope: options.scope,
            fileCount: hydrated.length,
            files: hydrated.map(({ file, contents }) => ({ ...file, ...contents })),
            prompt,
          },
          null,
          2,
        );

  if (options.outFile != null) {
    await writeFile(options.outFile, result, "utf8");
  }
  process.stdout.write(`${result}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
