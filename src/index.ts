import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getReviewWindowData, loadReviewFileContents } from "./git.js";
import { composeReviewPrompt } from "./prompt.js";
import { createReviewFeedbackAdapter } from "./review-adapter.js";

export default function (pi: ExtensionAPI) {
  const reviewAdapter = createReviewFeedbackAdapter();
  let reviewInProgress = false;

  async function reviewRepository(ctx: ExtensionCommandContext): Promise<void> {
    if (reviewInProgress) {
      ctx.ui.notify("A review window is already open.", "warning");
      return;
    }

    reviewInProgress = true;

    try {
      const { repoRoot, files } = await getReviewWindowData(pi, ctx.cwd);
      if (files.length === 0) {
        ctx.ui.notify("No reviewable files found.", "info");
        return;
      }

      const message = await reviewAdapter.collectFeedback({
        pi,
        ctx,
        repoRoot,
        files,
        loadContents: (file, scope) => loadReviewFileContents(pi, repoRoot, file, scope),
      });

      if (message == null || message.type === "cancel") {
        ctx.ui.notify("Review cancelled.", "info");
        return;
      }

      const prompt = composeReviewPrompt(files, message);
      ctx.ui.setEditorText(prompt);
      ctx.ui.notify("Inserted review feedback into the editor.", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Review failed: ${message}`, "error");
    } finally {
      reviewInProgress = false;
    }
  }

  pi.registerCommand("diff-review", {
    description: "Open a native review window with git diff, last commit, and all files scopes",
    handler: async (_args, ctx) => {
      await reviewRepository(ctx);
    },
  });

  pi.on("session_shutdown", async () => {
    reviewInProgress = false;
  });
}
