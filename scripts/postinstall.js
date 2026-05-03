import { writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.env.npm_config_global !== "true") process.exit(0);

const toolsDir = join(homedir(), ".claude", "tools");
await mkdir(toolsDir, { recursive: true });

const toolDef = {
  name: "diff_review",
  description: "Collect review context from git changes and return structured prompt payload.",
  command: "agent-diff-review-claude",
  input_schema: {
    type: "object",
    properties: {
      cwd: {
        type: "string",
        description: "Repository path (defaults to current working directory).",
      },
      scope: {
        type: "string",
        oneOf: [
          {
            const: "git-diff",
            description:
              "Compare working tree changes against HEAD (tracked and untracked changes).",
          },
          {
            const: "last-commit",
            description: "Compare the last commit against its parent commit.",
          },
          {
            const: "all-files",
            description:
              "Include all current text files from the working tree without diff comparison.",
          },
        ],
        description: "Which file scope to collect.",
      },
    },
    additionalProperties: false,
  },
};

await writeFile(join(toolsDir, "diff-review.json"), JSON.stringify(toolDef, null, 2), "utf8");
console.log("Registered diff_review tool in ~/.claude/tools/");
