/**
 * seed-agents.ts — Copy agent files from package-relative source to .pi/agents/ if they don't exist.
 *
 * Reusable by any Pi extension package that ships with default agents.
 *
 * Usage:
 *   import { seedAgents } from "./lib/seed-agents.ts";
 *
 *   // From a package file, pass import.meta.url so it can resolve relative paths
 *   seedAgents(import.meta.url, cwd);
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Copy agent files from a package-relative source directory into `.pi/agents/` in the project cwd.
 *
 * Skips files that already exist in the destination — useful for first-run setup without
 * overwriting user customizations.
 *
 * @param fileUrl   Pass `import.meta.url` from the calling extension file.
 * @param cwd       The project working directory (e.g. `_ctx.cwd`).
 * @param relPath   Relative path from the package dir to the source agents folder (default: `"../../agents"`).
 */
export function seedAgents(
  fileUrl: string,
  cwd: string,
  relPath = "../../agents",
): void {
  const pkgDir = dirname(fileURLToPath(fileUrl));
  const srcDir = resolve(join(pkgDir, relPath));
  const dstDir = join(cwd, ".pi", "agents");

  if (!existsSync(srcDir)) {
    console.log(`[seed-agents] source dir not found: ${srcDir}`);
    return;
  }

  // Ensure destination exists
  if (!existsSync(dstDir)) {
    mkdirSync(dstDir, { recursive: true });
  }

  // Copy each file that doesn't already exist in destination
  const files = readdirSync(srcDir);
  let copied = 0;

  for (const file of files) {
    const srcFile = join(srcDir, file);
    const dstFile = join(dstDir, file);

    if (!existsSync(dstFile)) {
      try {
        const content = readFileSync(srcFile, "utf-8");
        writeFileSync(dstFile, content);
        copied++;
        console.log(`[seed-agents] copied: ${file}`);
      } catch (err) {
        console.error(`[seed-agents] failed to copy ${file}:`, err);
      }
    } else {
      console.log(`[seed-agents] skipping (exists): ${file}`);
    }
  }

  if (copied > 0) {
    console.log(`[seed-agents] done — copied ${copied} file(s) to ${dstDir}`);
  }
}
