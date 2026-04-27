#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import * as tty from "tty";
import * as blessed from "blessed";

// ─── Configuration ────────────────────────────────────────────────
const DEV_DIR = path.resolve(__dirname, "../../dev");
const CONFIG_FILE = path.resolve(__dirname, "../../dev/.selected");

// ─── Helpers ──────────────────────────────────────────────────────
function getExtensionFiles(): string[] {
  try {
    const entries = fs.readdirSync(DEV_DIR, { withFileTypes: true });
    return entries
      .filter((d) => d.isFile() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    console.error(`Cannot read directory: ${DEV_DIR}`);
    process.exit(1);
  }
}

function loadSelected(): Set<string> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return new Set(
        content
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
  } catch {
    // ignore
  }
  return new Set();
}

function saveSelected(selected: Set<string>): void {
  fs.writeFileSync(CONFIG_FILE, Array.from(selected).join("\n") + "\n");
}

// ─── UI ───────────────────────────────────────────────────────────
function main() {
  const files = getExtensionFiles();
  if (files.length === 0) {
    console.log("No extension files found in dev/");
    process.exit(0);
  }

  const selected = loadSelected();
  const state = files.map((name) => selected.has(name));

  let cursor = 0; // current row index

  // Detect terminal size via tty (Bun's process.stdout lacks columns/rows/getWindowSize)
  const ttyReadStream = new tty.ReadStream(0);
  const termWidth = ttyReadStream.columns || 80;
  const termHeight = ttyReadStream.rows || 24;

  // Patch process.stdout to provide getWindowSize for blessed compatibility
  if (!process.stdout.getWindowSize) {
    (process.stdout as any).getWindowSize = () => [termWidth, termHeight];
    (process.stdout as any).columns = termWidth;
    (process.stdout as any).rows = termHeight;
  }

  // Set env vars blessed checks
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
    content: "  Select extensions to load in pi",
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

  // Calculate available height for list
  const listTop = 3;
  const statusBarHeight = 1;
  const listHeight = Math.min(files.length, screen.height - listTop - statusBarHeight);

  // Create blessed.box elements for each file (manual list with custom highlighting)
  const items: blessed.Box[] = [];
  for (let i = 0; i < files.length; i++) {
    const mark = state[i] ? "✓" : "○";
    const line = `  ${mark}  ${files[i]}`;
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
  }

  // Status bar
  const statusTop = listTop + listHeight;
  const status = blessed.box({
    top: statusTop,
    left: 0,
    width: "100%",
    height: statusBarHeight,
    content: `  Selected: 0 / ${files.length}  •  Press Enter to confirm`,
    fg: "cyan",
    bg: "black",
  });
  screen.append(status);

  function updateItem(index: number) {
    const mark = state[index] ? "✓" : "○";
    const line = `  ${mark}  ${files[index]}`;
    items[index].setContent(line);
  }

  function highlightRow(index: number) {
    // Reset all items to normal
    for (let i = 0; i < files.length; i++) {
      items[i].style.fg = "#cccccc";
      items[i].style.bg = "#000000";
    }
    // Highlight current row
    items[index].style.fg = "black";
    items[index].style.bg = "blue";
  }

  function updateStatus() {
    const count = state.filter(Boolean).length;
    status.setContent(`  Selected: ${count} / ${files.length}  •  Press Enter to confirm`);
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
    const selectedFiles = files.filter((_, i) => state[i]);
    saveSelected(new Set(selectedFiles));
    screen.destroy();
    console.log(`\n✅ Saved ${selectedFiles.length} extension(s):`);
    if (selectedFiles.length > 0) {
      console.log("  " + selectedFiles.join("\n  "));
    }
    console.log(`\nConfig: ${CONFIG_FILE}`);
    process.exit(0);
  }

  // ─── Key bindings ─────────────────────────────────────────────
  screen.key(["escape", "q", "C-c"], () => {
    screen.destroy();
    console.log("\n⚠️  Cancelled. No changes saved.");
    process.exit(0);
  });

  screen.key(["down", "C-n"], () => {
    if (cursor < files.length - 1) {
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
