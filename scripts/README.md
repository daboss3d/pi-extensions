# Scripts

## `pi.sh` — Launch pi with selected extensions

The main entry point. Runs the extension picker, then launches `pi` with all selected extensions.

```bash
./pi.sh
```

**Flow:**
1. Launches `epi/epi` — interactive terminal UI to select extensions
2. Reads `dev/.selected` (one filename per line)
3. Launches `pi -e base-commands.ts -e minimal-mode.ts ...`

## `epi/epi` — Extension picker

Interactive terminal UI to select which extensions from `dev/` should be loaded.

```bash
./epi/epi
```

### Navigation

| Key       | Action              |
|-----------|---------------------|
| `↑` / `C-p` | Move up         |
| `↓` / `C-n` | Move down       |
| `Space`   | Toggle selection    |
| `Enter`   | Confirm and save    |
| `q` / `Esc` / `C-c` | Quit without saving |

### Visual markers

- `✓` — extension is **enabled** (will be loaded)
- `○` — extension is **disabled** (will be skipped)
- Blue highlight — currently selected row

### Config

Selections are saved to `dev/.selected` (one file name per line).

## `ppi.sh` — Package picker for Pi

Adds packages from the `packages/` directory into your project's `.pi/settings.json`.

```bash
./ppi.sh
```

**Flow:**
1. Scans `packages/` directory for pi packages
2. Interactive terminal UI to select packages
3. Merges selected packages into `.pi/settings.json` in your current working directory

**Use when:** You want to permanently add a package from this repo to a project.

**Differs from `epi`:**
- `epi` → `dev/` extensions, saves to `dev/.selected` (ephemeral, for `pi.sh`)
- `ppi` → `packages/` packages, saves to `.pi/settings.json` (persistent, project-scoped)

### Example output

After selecting `base-commands`, your `.pi/settings.json` will contain:

```json
{
  "packages": [
    "/absolute/path/to/pi-extensions/packages/base-commands"
  ]
}
```

Existing settings (provider, model, theme) are preserved.
