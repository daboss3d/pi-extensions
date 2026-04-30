# pi-extensions/subagent

Spawn background subagents with live widgets and persistent sessions.

## Features

- **Live widgets** — watch subagents run in real-time with status, tool count, and output preview
- **Persistent sessions** — subagents remember their conversation history across continuations
- **Tool access** — subagents can read files, run bash commands, grep, find, and list directories
- **Auto-delivery** — results are posted as follow-up messages when subagents finish

## Installation

Drop this package into your Pi Agent extensions directory:

```sh
# Symlink the package
ln -s /path/to/pi-extensions/packages/subagent ~/.pi/agent/extensions/subagent
```

## Usage

### Slash Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/sub <task>` | Spawn a new subagent with a live widget | `/sub list files and summarize` |
| `/subcont <n> <prompt>` | Continue subagent #n's conversation | `/subcont 1 now write tests for it` |
| `/subrm <n>` | Remove subagent #n (kills if running) | `/subrm 2` |
| `/subclear` | Clear all subagent widgets | `/subclear` |

### Tool-Based API

The main agent can also spawn subagents programmatically via registered tools:

| Tool | Description |
|------|-------------|
| `subagent_create` | Spawn a background subagent with a task description |
| `subagent_continue` | Continue an existing subagent's conversation |
| `subagent_remove` | Remove a specific subagent |
| `subagent_list` | List all active and finished subagents |

### Example

```
# Spawn a subagent to analyze the codebase
/sub review the src directory and summarize key modules

# Continue the subagent with follow-up instructions
/subcont 1 now write unit tests for the main functions

# Remove a subagent
/subrm 1
```

## Architecture

```
packages/subagent/
├── README.md              # This file
├── package.json           # Package metadata
├── extensions/
│   ├── subagent.ts        # Main extension — tools + slash commands + widgets
│   └── themeMap.ts        # Theme mapping (cyberpunk by default)
```

## Session Persistence

Subagent sessions are stored as JSONL files in `~/.pi/agent/sessions/subagents/`. Each continuation (`/subcont`) appends to the existing session, preserving full conversation history.
