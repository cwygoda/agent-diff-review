#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageDirs = ["packages/core", "packages/pi", "packages/claude"];

const manifests = new Map();
for (const dir of packageDirs) {
  const pkg = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  manifests.set(pkg.name, { dir, pkg });
}

const internalNames = new Set(manifests.keys());
const depFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

const failures = [];
for (const { dir, pkg } of manifests.values()) {
  for (const field of depFields) {
    const deps = pkg[field] ?? {};
    for (const [name, spec] of Object.entries(deps)) {
      if (!internalNames.has(name)) continue;
      if (typeof spec !== "string") continue;
      if (!spec.startsWith("workspace:")) {
        failures.push(`${dir}/package.json -> ${field}.${name} must use workspace:* (found: ${spec})`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Internal workspace dependency check failed:\n");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("Internal workspace dependency check passed.");
