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
