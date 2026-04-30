/**
 * themeMap.ts — Per-extension default theme assignments
 *
 * Themes live in .pi/themes/ and are mapped by extension filename (no extension).
 * Each extension calls applyExtensionDefaults(import.meta.url, ctx) in its session_start
 * hook to automatically load its designated theme on boot.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { basename } from "path";
import { fileURLToPath } from "url";

// ── Theme assignments ──────────────────────────────────────────────────────

export const THEME_MAP: Record<string, string> = {
  "orch": "midnight-ocean",         // deep orchestration, layered control
};

// ── Helpers ───────────────────────────────────────────────────────────────

function extensionName(fileUrl: string): string {
  const filePath = fileUrl.startsWith("file://") ? fileURLToPath(fileUrl) : fileUrl;
  return basename(filePath).replace(/\.[^.]+$/, "");
}

function primaryExtensionName(): string | null {
  const argv = process.argv;
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === "-e" || argv[i] === "--extension") {
      return basename(argv[i + 1]).replace(/\.[^.]+$/, "");
    }
  }
  return null;
}

function applyExtensionTitle(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  const name = primaryExtensionName();
  if (!name) return;
  setTimeout(() => ctx.ui.setTitle(`π - ${name}`), 150);
}

// ── Combined default ───────────────────────────────────────────────────────

export function applyExtensionDefaults(fileUrl: string, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const name = extensionName(fileUrl);
  let themeName = THEME_MAP[name];

  if (!themeName) {
    themeName = "synthwave";
  }

  const result = ctx.ui.setTheme(themeName);

  if (!result.success && themeName !== "synthwave") {
    ctx.ui.setTheme("synthwave");
  }

  applyExtensionTitle(ctx);
}
