# epi — Extension Picker for pi

Launches an interactive terminal UI to select which extensions from `dev/` should be loaded when starting pi.

## Usage

```bash
./scripts/epi/epi
```

## Navigation

| Key       | Action              |
|-----------|---------------------|
| `↑` / `C-p` | Move up         |
| `↓` / `C-n` | Move down       |
| `Space`   | Toggle selection    |
| `Enter`   | Confirm and save    |
| `q` / `Esc` / `C-c` | Quit without saving |

## Visual markers

- `✓` — extension is **enabled** (will be loaded)
- `○` — extension is **disabled** (will be skipped)
- Blue highlight — currently selected row

## Config

Selections are saved to `dev/.selected` (one file name per line).

## Tech

- **TypeScript** + **Bun**
- **blessed** for terminal UI rendering
