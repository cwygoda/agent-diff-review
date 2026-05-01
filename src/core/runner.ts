import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommandRunner } from "./git.ts";

const execFileAsync = promisify(execFile);

export function createCommandRunner(): CommandRunner {
  return {
    async exec(command, args, options) {
      try {
        const { stdout, stderr } = await execFileAsync(command, args, { cwd: options.cwd });
        return { code: 0, stdout: stdout ?? "", stderr: stderr ?? "" };
      } catch (error) {
        const err = error as { code?: number; stdout?: string; stderr?: string };
        return {
          code: typeof err.code === "number" ? err.code : 1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
        };
      }
    },
  };
}
