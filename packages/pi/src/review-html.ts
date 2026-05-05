import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewWindowData } from "@cwygoda/agent-diff-review-core/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "..", "web");

function escapeForInlineScript(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function buildReviewHtml(data: ReviewWindowData): string {
  const templateHtml = readFileSync(join(webDir, "index.html"), "utf8");
  const appJs = readFileSync(join(webDir, "dist", "review.js"), "utf8");
  const css = [
    readFileSync(join(webDir, "dist", "styles.css"), "utf8"),
    readFileSync(join(webDir, "dist", "monaco.css"), "utf8"),
  ].join("\n");
  const payload = escapeForInlineScript(JSON.stringify(data));
  return templateHtml
    .replace("__INLINE_CSS__", css.replace(/<\/style/gi, "<\\/style"))
    .replace("__INLINE_DATA__", payload)
    .replace("__APP_JS_SRC__", `data:text/javascript;charset=utf-8,${encodeURIComponent(appJs)}`);
}
