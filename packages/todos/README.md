# Pi Todos Extension

File-based todo manager for Pi Agent. Todos are stored as individual markdown files under `.pi/todos/` (or a custom path via `PI_TODO_PATH`).

This was based on the [github](https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/todos.ts) and a informational [video](https://www.youtube.com/watch?v=uPR7aAneg2U)


## File Format

Each todo is a standalone `.md` file with a JSON front matter block followed by optional markdown body text:

```json
{
  "id": "deadbeef",
  "title": "Add tests",
  "tags": ["qa"],
  "status": "open",
  "created_at": "2026-01-25T17:00:00.000Z",
  "assigned_to_session": "session.json"
}

Notes about the work go here.
```

## Usage

Let the LLM use todos naturally via the `todo` tool, or open the interactive TUI with:

```
/todos
```

## Tool Actions

| Action | Description |
|---|---|
| `list` | List open and assigned todos (excludes closed) |
| `list-all` | List all todos including closed |
| `get` | Get a single todo by id |
| `create` | Create a new todo (`title` required) |
| `update` | Update fields of an existing todo (replaces `body`) |
| `append` | Append text to the todo body |
| `delete` | Permanently delete a todo |
| `claim` | Assign a todo to the current session |
| `release` | Unassign a todo from the current session |

## TUI Actions

From the `/todos` interface, select a todo and choose:

| Action | Description |
|---|---|
| `work` | Start working on the todo (sends prompt to LLM) |
| `refine` | Ask the LLM clarifying questions to refine the task |
| `close` / `reopen` | Toggle todo status |
| `release` | Unassign from current session |
| `copy path` | Copy the todo file path to clipboard |
| `copy text` | Copy title and body to clipboard |
| `delete` | Permanently delete (with confirmation) |

**Keyboard shortcuts:** `↑↓` navigate, `Enter` actions, `Ctrl+Shift+W` work, `Ctrl+Shift+R` refine, `Esc` close.

## Settings

Stored in `.pi/todos/settings.json`:

```json
{
  "gc": true,
  "gcDays": 7
}
```

| Setting | Default | Description |
|---|---|---|
| `gc` | `true` | Auto-delete closed todos older than `gcDays` on session start |
| `gcDays` | `7` | Age threshold in days |

## Custom Path

Set `PI_TODO_PATH` to store todos elsewhere:

```bash
export PI_TODO_PATH="/path/to/todos"
```

## Locking

A `.lock` file is created while a session edits a todo to prevent conflicts. Locks expire after 30 minutes and can be stolen in interactive mode.
