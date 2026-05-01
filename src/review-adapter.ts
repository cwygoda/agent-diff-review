import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { open } from "glimpseui";
import type { ReviewScope } from "./core/types.js";
import type {
  ReviewCancelPayload,
  ReviewFile,
  ReviewFileContents,
  ReviewHostMessage,
  ReviewRequestFilePayload,
  ReviewSubmitPayload,
  ReviewWindowMessage,
} from "./core/types.js";
import { buildReviewHtml } from "./ui.js";

export interface ReviewFeedbackAdapter {
  readonly id: string;
  collectFeedback(input: {
    pi: ExtensionAPI;
    ctx: ExtensionCommandContext;
    repoRoot: string;
    files: ReviewFile[];
    loadContents: (file: ReviewFile, scope: ReviewScope) => Promise<ReviewFileContents>;
  }): Promise<ReviewSubmitPayload | ReviewCancelPayload | null>;
}

type WaitingEditorResult = "escape" | "window-settled";

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

function truncateLine(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 3) return ".".repeat(Math.max(0, width));
  return `${value.slice(0, Math.max(0, width - 3))}...`;
}

function showWaitingUI(ctx: ExtensionCommandContext): {
  promise: Promise<WaitingEditorResult>;
  dismiss: () => void;
} {
  let settled = false;
  let doneFn: ((result: WaitingEditorResult) => void) | null = null;
  let pendingResult: WaitingEditorResult | null = null;

  const finish = (result: WaitingEditorResult): void => {
    if (settled) return;
    settled = true;
    if (doneFn != null) {
      doneFn(result);
    } else {
      pendingResult = result;
    }
  };

  const promise = ctx.ui.custom<WaitingEditorResult>((_tui, theme, _kb, done) => {
    doneFn = done;
    if (pendingResult != null) {
      const result = pendingResult;
      pendingResult = null;
      queueMicrotask(() => done(result));
    }

    return {
      render(width: number): string[] {
        const innerWidth = Math.max(24, width - 2);
        const borderTop = theme.fg("border", `╭${"─".repeat(innerWidth)}╮`);
        const borderBottom = theme.fg("border", `╰${"─".repeat(innerWidth)}╯`);
        const lines = [
          theme.fg("accent", theme.bold("Waiting for review")),
          "The native review window is open.",
          "Press Escape to cancel and close the review window.",
        ];
        return [
          borderTop,
          ...lines.map(
            (line) =>
              `${theme.fg("border", "│")}${truncateLine(line, innerWidth).padEnd(innerWidth, " ")}${theme.fg("border", "│")}`,
          ),
          borderBottom,
        ];
      },
      handleInput(data: string): void {
        if (data === "\u001b") {
          finish("escape");
        }
      },
      invalidate(): void {},
    };
  });

  const dismiss = (): void => {
    finish("window-settled");
  };

  return { promise, dismiss };
}

const nativeAdapter: ReviewFeedbackAdapter = {
  id: "native",
  async collectFeedback({ ctx, repoRoot, files, loadContents }) {
    const html = buildReviewHtml({ repoRoot, files });
    const window = open(html, {
      width: 1680,
      height: 1020,
      title: "diff review",
    });

    const waitingUI = showWaitingUI(ctx);
    const fileMap = new Map(files.map((file) => [file.id, file]));
    const contentCache = new Map<string, Promise<ReviewFileContents>>();

    const closeWindow = (): void => {
      try {
        window.close();
      } catch {
        // best effort
      }
    };

    const sendWindowMessage = (message: ReviewHostMessage): void => {
      const payload = escapeForInlineScript(JSON.stringify(message));
      window.send(`window.__reviewReceive(${payload});`);
    };

    const getContents = (file: ReviewFile, scope: ReviewScope): Promise<ReviewFileContents> => {
      const cacheKey = `${scope}:${file.id}`;
      const cached = contentCache.get(cacheKey);
      if (cached != null) return cached;
      const pending = loadContents(file, scope);
      contentCache.set(cacheKey, pending);
      return pending;
    };

    ctx.ui.notify("Opened native review window.", "info");

    try {
      const terminalMessagePromise = new Promise<ReviewSubmitPayload | ReviewCancelPayload | null>(
        (resolve, reject) => {
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
            resolve(value);
          };

          const handleRequestFile = async (message: ReviewRequestFilePayload): Promise<void> => {
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

            try {
              const contents = await getContents(file, message.scope);
              sendWindowMessage({
                type: "file-data",
                requestId: message.requestId,
                fileId: message.fileId,
                scope: message.scope,
                originalContent: contents.originalContent,
                modifiedContent: contents.modifiedContent,
              });
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              sendWindowMessage({
                type: "file-error",
                requestId: message.requestId,
                fileId: message.fileId,
                scope: message.scope,
                message: messageText,
              });
            }
          };

          const onMessage = (data: unknown): void => {
            const message = data as ReviewWindowMessage;
            if (isRequestFilePayload(message)) {
              void handleRequestFile(message);
              return;
            }
            if (isSubmitPayload(message) || isCancelPayload(message)) {
              settle(message);
            }
          };

          const onClosed = (): void => {
            settle(null);
          };

          const onError = (error: Error): void => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
          };

          window.on("message", onMessage);
          window.on("closed", onClosed);
          window.on("error", onError);
        },
      );

      const result = await Promise.race([
        terminalMessagePromise.then((message) => ({ type: "window" as const, message })),
        waitingUI.promise.then((reason) => ({ type: "ui" as const, reason })),
      ]);

      if (result.type === "ui" && result.reason === "escape") {
        closeWindow();
        await terminalMessagePromise.catch(() => null);
        return { type: "cancel" };
      }

      const message = result.type === "window" ? result.message : await terminalMessagePromise;
      waitingUI.dismiss();
      await waitingUI.promise;
      closeWindow();
      return message;
    } catch (error) {
      waitingUI.dismiss();
      closeWindow();
      throw error;
    }
  },
};

function parseMockSubmit(
  files: ReviewFile[],
  env: NodeJS.ProcessEnv,
): ReviewSubmitPayload | ReviewCancelPayload {
  const mode = env.AGENT_DIFF_REVIEW_MOCK_MODE?.trim().toLowerCase();
  if (mode === "cancel") {
    return { type: "cancel" };
  }

  const submitJson = env.AGENT_DIFF_REVIEW_MOCK_SUBMIT_JSON;
  if (submitJson != null && submitJson.trim().length > 0) {
    return JSON.parse(submitJson) as ReviewSubmitPayload;
  }

  const file = files[0];
  if (file == null) {
    return { type: "submit", overallComment: "", comments: [] };
  }

  const scope: ReviewScope = file.inGitDiff
    ? "git-diff"
    : file.inLastCommit
      ? "last-commit"
      : "all-files";

  return {
    type: "submit",
    overallComment: "Mock review submission",
    comments: [
      {
        id: "mock-1",
        fileId: file.id,
        scope,
        side: "file",
        startLine: null,
        endLine: null,
        body: `Mock adapter comment for ${file.path}`,
      },
    ],
  };
}

const mockAdapter: ReviewFeedbackAdapter = {
  id: "mock",
  async collectFeedback({ ctx, files }) {
    ctx.ui.notify("Using mock review adapter.", "info");
    const delayMs = Number.parseInt(process.env.AGENT_DIFF_REVIEW_MOCK_DELAY_MS ?? "0", 10);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return parseMockSubmit(files, process.env);
  },
};

export function createReviewFeedbackAdapter(
  env: NodeJS.ProcessEnv = process.env,
): ReviewFeedbackAdapter {
  const adapterName = env.AGENT_DIFF_REVIEW_UI_ADAPTER?.trim().toLowerCase();
  if (adapterName === "mock") return mockAdapter;
  return nativeAdapter;
}
