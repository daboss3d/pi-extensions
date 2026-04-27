---
name: todo
description: Manage a todo list with add, remove, and list commands. Todos are stored as YAML files in a configurable directory. Use whenever the user wants to track tasks, create a to-do list, or manage their todo items.
---

# Todo Skill

Manage a simple todo list stored as YAML files.

## Variables

- **TODO_DIR**: `~/.pi/todos/` — Directory where todo files are stored. Create this directory if it does not exist.

## Todo File Format

Each todo file is a YAML file with the following structure:

```yaml
title: My Task
status: pending   # pending | in_progress | done
created_at: 2025-01-15T10:30:00
updated_at: 2025-01-15T10:30:00
```

- Each todo is stored as a separate `.yaml` file in `TODO_DIR`.
- The filename should be a short, descriptive, lowercase-with-hyphens name (e.g., `fix-login-bug.yaml`).
- Use `status: pending` for new todos.
- Use `status: done` for completed todos.
- Use `status: in_progress` for active todos.

## Commands

### Add a Todo

Create a new todo file:

1. Ensure `TODO_DIR` exists (`mkdir -p $TODO_DIR`).
2. Create a new YAML file in `TODO_DIR` with the todo details.
3. Use the current timestamp for `created_at` and `updated_at`.
4. Set `status: pending` by default.

**Example:**

```bash
cat > ~/.pi/todos/fix-login-bug.yaml <<EOF
title: Fix the login bug
status: pending
created_at: 2025-01-15T10:30:00
updated_at: 2025-01-15T10:30:00
EOF
```

### Remove a Todo

Delete the todo file:

```bash
rm ~/.pi/todos/fix-login-bug.yaml
```

### List Todos

List all todos (optionally filtered by status):

```bash
ls ~/.pi/todos/
```

Then read each `.yaml` file to display the title, status, and creation date.

## Usage Examples

- "Add a todo to fix the login bug" → create `fix-login-bug.yaml`
- "Remove the fix-login-bug todo" → delete `fix-login-bug.yaml`
- "List my todos" → read all `.yaml` files in `TODO_DIR` and display them
- "List my pending todos" → filter by `status: pending`

