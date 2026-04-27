# ppi — Package Picker for Pi

Interactive terminal UI to select packages from the `pi-extensions` repository and add them to your project's `.pi/settings.json`.

## Usage

```bash
# From the pi-extensions repo root
./scripts/ppi.sh
```

Or run directly:

```bash
bun scripts/ppi/ppi.tsx
```

## Flow

1. **Scan** — Reads all packages from `packages/` directory
2. **Pick** — Interactive checkbox UI (same as `epi`)
3. **Write** — Merges selected packages into `.pi/settings.json` in your current working directory

## Output

On confirm, `ppi` writes to `.pi/settings.json` in the project root where you ran the script:

```json
{
  "packages": [
    "/absolute/path/to/pi-extensions/packages/base-commands"
  ]
}
```

Existing settings are preserved — only the `packages` array is merged.

## Features

- **Auto-merge** — Doesn't overwrite existing packages, just adds new ones
- **Dependency warnings** — Shows peer dependency warnings for selected packages
- **Preserves other settings** — Provider, model, theme, etc. stay intact
- **Creates `.pi/` if missing** — No need to manually create the directory

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `C-p` | Move up |
| `↓` / `C-n` | Move down |
| `Space` | Toggle selection |
| `Enter` | Confirm and save |
| `q` / `Esc` / `C-c` | Quit without saving |

## Visual Markers

- `✓` — package is **selected** (will be added)
- `○` — package is **not selected** (will be skipped)
- Blue highlight — currently selected row

## Difference from `epi`

| Script | Target | Output |
|--------|--------|--------|
| `epi` | `dev/` extensions | `dev/.selected` (for `pi.sh` launch) |
| `ppi` | `packages/` packages | `.pi/settings.json` (persistent, project-scoped) |

Use `epi` for quick dev/testing sessions. Use `ppi` to permanently add packages to a project.
