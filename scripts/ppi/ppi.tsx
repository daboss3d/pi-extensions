#!/usr/bin/env bun
/**
 * ppi — Package Picker for Pi
 *
 * Interactive terminal UI to select packages from the pi-extensions
 * repository and write them into your project's .pi/settings.json.
 *
 * Usage:
 *   ./scripts/ppi/ppi.tsx
 *
 * Flow:
 *   1. Scans packages/ directory for pi packages
 *   2. Shows interactive checkbox picker
 *   3. On confirm, merges selected packages into .pi/settings.json
 *      in the user's current working directory (the project root)
 */
import * as fs from "fs";
import * as path from "path";
import * as tty from "tty";
import * as blessed from "blessed";

// ─── Configuration ────────────────────────────────────────────────
// Resolve from scripts/ppi/ up to the repo root
const SCRIPT_DIR = path.dirname(import.meta.url.replace(/^file:\/\//, ""));
const PACKAGES_DIR = path.resolve(SCRIPT_DIR, "../..", "packages");
const SETTINGS_FILE = ".pi/settings.json";

// ─── Types ────────────────────────────────────────────────────────
interface PackageInfo {
  name: string;
  description: string;
  relativePath: string;
  peerDeps: string[];
  piExtensions: string[];
  piSkills: string[];
  piPrompts: string[];
  piThemes: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────
function getPackageList(): PackageInfo[] {
  try {
    const entries = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });
    const packages: PackageInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pkgJsonPath = path.join(PACKAGES_DIR, entry.name, "package.json");
      if (!fs.existsSync(pkgJsonPath)) continue;

      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      const piConfig = (pkgJson.pi as Record<string, string[] | string>) || {};

      packages.push({
        name: pkgJson.name || entry.name,
        description: pkgJson.description || entry.name,
        relativePath: path.join(PACKAGES_DIR, entry.name),
        peerDeps: Object.keys(pkgJson.peerDependencies || {}),
        piExtensions: Array.isArray(piConfig.extensions) ? piConfig.extensions : [],
        piSkills: Array.isArray(piConfig.skills) ? piConfig.skills : [],
        piPrompts: Array.isArray(piConfig.prompts) ? piConfig.prompts : [],
        piThemes: Array.isArray(piConfig.themes) ? piConfig.themes : [],
      });
    }

    return packages.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error(`❌ Cannot read packages directory: ${PACKAGES_DIR}`);
    console.error(err);
    process.exit(1);
  }
}

function loadSettings(): { packages: string[] } {
  const settingsPath = path.resolve(process.cwd(), SETTINGS_FILE);
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(content);
      return { packages: parsed.packages || [] };
    } catch {
      // ignore malformed JSON
    }
  }
  return { packages: [] };
}

function saveSettings(packages: string[]): void {
  const settingsPath = path.resolve(process.cwd(), SETTINGS_FILE);
  const settingsDir = path.dirname(settingsPath);

  // Create .pi directory if it doesn't exist
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  const output: Record<string, unknown> = { packages };

  // Preserve other keys from existing settings
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, "utf-8");
      const existingSettings = JSON.parse(content);
      for (const key of Object.keys(existingSettings)) {
        if (key !== "packages") {
          output[key] = existingSettings[key];
        }
      }
    } catch {
      // ignore
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(output, null, 2) + "\n");
}

function shortenPath(p: string): string {
  const home = require("os").homedir();
  if (p.startsWith(home)) {
    return `~/${p.slice(home.length + 1)}`;
  }
  return p;
}

// ─── UI ───────────────────────────────────────────────────────────
function main() {
  const packages = getPackageList();
  if (packages.length === 0) {
    console.log("No packages found in packages/");
    process.exit(0);
  }

  const existing = loadSettings();
  const state = packages.map((pkg) => existing.packages.includes(pkg.relativePath));

  let cursor = 0;

  // Terminal size
  const ttyReadStream = new tty.ReadStream(0);
  const termWidth = ttyReadStream.columns || 80;
  const termHeight = ttyReadStream.rows || 24;

  if (!process.stdout.getWindowSize) {
    (process.stdout as any).getWindowSize = () => [termWidth, termHeight];
    (process.stdout as any).columns = termWidth;
    (process.stdout as any).rows = termHeight;
  }

  process.env.COLUMNS = String(termWidth);
  process.env.LINES = String(termHeight);

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
  });

  // Title bar
  const title = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: "  Manage packages for this project",
    fg: "white",
    bold: true,
    bg: "black",
  });

  // Instructions
  const instructions = blessed.box({
    top: 1,
    left: 0,
    width: "100%",
    height: 1,
    content: "  ↑↓ navigate  •  Space toggle  •  Enter confirm  •  q quit",
    fg: "yellow",
    bg: "black",
  });

  screen.append(instructions);
  screen.append(title);

  // Separator
  const separator = blessed.line({
    top: 2,
    left: 0,
    width: "100%",
  });

  // Available height for list
  const listTop = 3;
  const statusBarHeight = 3;
  const listHeight = Math.min(packages.length, screen.height - listTop - statusBarHeight);

  // Create list items
  const items: blessed.Box[] = [];
  const descItems: blessed.Box[] = [];

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    const mark = state[i] ? "✓" : "○";
    const shortDesc = pkg.description.length > termWidth - 20
      ? pkg.description.slice(0, termWidth - 23) + "..."
      : pkg.description;

    // Main line: checkbox + name
    const line = `  ${mark}  ${pkg.name}`;
    const el = blessed.box({
      top: listTop + i,
      left: 0,
      width: "100%",
      height: 1,
      content: line,
      fg: "#cccccc",
      bg: "#000000",
    });
    screen.append(el);
    items.push(el);

    // Description line (below main line)
    const descLine = `      ${shortDesc}`;
    const descEl = blessed.box({
      top: listTop + i + 1,
      left: 0,
      width: "100%",
      height: 1,
      content: descLine,
      fg: "#666666",
      bg: "#000000",
    });
    screen.append(descEl);
    descItems.push(descEl);
  }

  // Status bar
  const statusTop = listTop + listHeight;
  const status = blessed.box({
    top: statusTop,
    left: 0,
    width: "100%",
    height: statusBarHeight,
    content: `  Selected: 0 / ${packages.length}  •  Press Enter to update .pi/settings.json`,
    fg: "cyan",
    bg: "black",
  });
  screen.append(status);

  function updateItem(index: number) {
    const pkg = packages[index];
    const mark = state[index] ? "✓" : "○";
    items[index].setContent(`  ${mark}  ${pkg.name}`);
  }

  function highlightRow(index: number) {
    for (let i = 0; i < packages.length; i++) {
      items[i].style.fg = "#cccccc";
      items[i].style.bg = "#000000";
      descItems[i].style.fg = "#666666";
      descItems[i].style.bg = "#000000";
    }
    items[index].style.fg = "black";
    items[index].style.bg = "blue";
    descItems[index].style.fg = "black";
    descItems[index].style.bg = "blue";
  }

  function updateStatus() {
    const count = state.filter(Boolean).length;
    const selectedPkgs = packages.filter((_, i) => state[i]);
    let statusText = `  Selected: ${count} / ${packages.length}  •  Press Enter to update .pi/settings.json`;

    if (selectedPkgs.length > 0) {
      const deps = selectedPkgs
        .flatMap((p) => p.peerDeps)
        .filter((d) => !d.startsWith("@mariozechner/pi-"));
      if (deps.length > 0) {
        statusText += `\n  ⚠️  Peer deps: ${deps.join(", ")}`;
      }
    }

    status.setContent(statusText);
  }

  function render() {
    highlightRow(cursor);
    updateStatus();
    screen.render();
  }

  function toggleCurrent() {
    state[cursor] = !state[cursor];
    updateItem(cursor);
    updateStatus();
    screen.render();
  }

  function confirm() {
    const selectedPkgs = packages.filter((_, i) => state[i]);
    if (selectedPkgs.length === 0) {
      status.setContent("  Nothing selected. Press Enter to confirm or q to quit.");
      screen.render();
      return;
    }

    const paths = selectedPkgs.map((p) => p.relativePath);
    saveSettings(paths);

    screen.destroy();

    const settingsPath = path.resolve(process.cwd(), SETTINGS_FILE);
    console.log(`\n✅ Updated ${shortenPath(settingsPath)} with ${selectedPkgs.length} package(s):`);
    for (const pkg of selectedPkgs) {
      console.log(`  • ${pkg.name}`);
      if (pkg.piExtensions.length > 0) {
        console.log(`    extensions: ${pkg.piExtensions.join(", ")}`);
      }
      if (pkg.piSkills.length > 0) {
        console.log(`    skills: ${pkg.piSkills.join(", ")}`);
      }
      const deps = pkg.peerDeps.filter((d) => !d.startsWith("@mariozechner/pi-"));
      if (deps.length > 0) {
        console.log(`    peer deps: ${deps.join(", ")}`);
      }
    }
    console.log(`\n📍 Config: ${shortenPath(settingsPath)}`);
    console.log(`\n🚀 Restart pi to load the new packages.`);
    process.exit(0);
  }

  // ─── Key bindings ─────────────────────────────────────────────
  screen.key(["escape", "q", "C-c"], () => {
    screen.destroy();
    console.log("\n⚠️  Cancelled. No changes saved.");
    process.exit(0);
  });

  screen.key(["down", "C-n"], () => {
    if (cursor < packages.length - 1) {
      cursor++;
      render();
    }
  });

  screen.key(["up", "C-p"], () => {
    if (cursor > 0) {
      cursor--;
      render();
    }
  });

  screen.key(["space"], () => {
    toggleCurrent();
  });

  screen.key(["enter", "C-m"], () => {
    confirm();
  });

  render();
}

main();
