import { resolve } from "node:path";
import { defineConfig } from "vite";

const ROOT_DIR = __dirname;

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: "esbuild",
    outDir: resolve(ROOT_DIR, "web", "dist"),
    target: "es2022",
    lib: {
      entry: resolve(ROOT_DIR, "web", "app.js"),
      formats: ["iife"],
      name: "AgentDiffReview",
      fileName: () => "review.js",
      cssFileName: "monaco",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
