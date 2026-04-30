# pi-extensions/orch

Multi-agent orchestration system. Spawn, manage, and coordinate multiple AI agents — each with its own role, model, and tools — from YAML configuration files.

## Features

- **YAML-defined agents** — Declarative agent configs with model, tools, system prompt, and limits
- **Local + global configs** — Project-specific agents override shared defaults
- **Live widgets** — Watch all managed agents in real-time with status, tool count, and output preview
- **Persistent sessions** — Each agent maintains its own conversation history
- **Tool-based API** — The main agent can spawn/manage agents programmatically
- **Config resolution** — `local/.pi/agents/orch/` → `~/.pi/agents/orch/` → bundled fallback
- **Persistent memory** — Agents write findings to shared memory; next sessions reuse knowledge
- **Memory search** — Query memory for keywords; agents read context before starting tasks
- **Auto-compaction** — Memory files automatically trimmed after each agent completes
- **Manual summarization** — Compress old findings to save tokens

## Installation

```sh
# Symlink into your extensions directory
ln -s /path/to/pi-extensions/packages/orch ~/.pi/agent/extensions/orch
```

## Quick Start

### Create Your First Agent Config

```yaml
# ~/.pi/agents/orch/agents/scout.yaml
name: scout
model: openrouter/google/gemini-3-flash-preview
tools: read,bash,grep,find,ls
system_prompt: |
  You are a scout agent. Explore the codebase and report findings.
  Be thorough — list files, summarize structure, and flag anything interesting.
max_turns: 10
```

### Use the Orchestrator

```sh
# Spawn an agent from a YAML config
/orch add scout "Explore the src directory and summarize the architecture"

# List all active agents
/orch list

# Continue a running agent
/orch cont 1 "Now dig into the core module specifically"

# Remove an agent
/orch remove 1

# Clear all agents
/orch clear

## Memory System

Agents automatically write findings to persistent memory. Next sessions load this context, saving tokens and preserving knowledge.

### Memory Files

| File | Budget | Purpose |
|------|--------|---------|
| `MEMORY.md` | 1000 | Index + session context (always loaded) |
| `project.md` | 5000 | Architecture, key files, dependencies, patterns |
| `user.md` | 3000 | User preferences, coding style, habits |
| `reference.md` | 5000 | API contracts, config schemas, external services |
| `feedback.md` | 3000 | What worked, what didn't, corrections |
| `decisions.md` | 3000 | Architectural decisions and rationale |

### Memory Commands

```sh
# View memory index
/orch memory

# Read a specific file
/orch memory read project.md

# Search memory
/orch memory query "authentication system"

# Show memory statistics
/orch memory stats

# Compact memory (trim oldest entries)
/orch memory compact

# Summarize a section (compress old entries)
/orch memory summarize project.md Architecture
```

### How It Works

1. **Initialization** — Memory files created on first use in a project
2. **Agent spawning** — MEMORY.md index injected into agent system prompt
3. **Agent completion** — Orchestrator extracts findings → writes to appropriate files
4. **Auto-compaction** — Memory files automatically trimmed after each agent
5. **Manual summarization** — Compress old entries via `/orch memory compact`

### Compaction Tiers

- **Tier 1 (trim)**: Automatic — oldest sections dropped when budget exceeded
- **Tier 2 (summarize)**: Manual — `/orch memory compact` compresses entries via LLM
- **Tier 3 (merge)**: Manual — `/orch memory merge` merges into coherent document

### Token Budget

- Each memory file: budget varies (3000-5000 tokens depending on file)
- MEMORY.md index: max 1000 tokens
- Auto-compact runs after each agent completes
- Oldest sections trimmed first when budget exceeded
- Agents see compact, relevant context every session

## YAML Config Schema

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | Yes | — | Agent identifier (used in filenames) |
| `model` | No | `openrouter/google/gemini-3-flash-preview` | Model provider/id |
| `tools` | No | `read,bash,grep,find,ls` | Comma-separated tool list |
| `system_prompt` | No | _(none)_ | System prompt for the agent |
| `max_turns` | No | `20` | Max conversation turns before auto-stop |

## Config Resolution

Agent configs are resolved in this order (first match wins):

1. **Local**: `<project>/.pi/agents/orch/agents/<name>.yaml`
2. **Global**: `~/.pi/agents/orch/agents/<name>.yaml`
3. **Bundled**: shipped with the extension (e.g. `scout.yaml`)

This lets you have project-specific overrides, shared defaults, and sensible fallbacks out of the box.

## Directory Structure

```
packages/orch/
├── README.md              # This file
├── package.json           # Package metadata
├── extensions/
│   ├── orchestration.ts   # Main extension — slash commands + tools + widgets
│   ├── agent-runner.ts    # Process spawning, streaming, session management
│   ├── yaml-loader.ts     # YAML config parsing and resolution
│   ├── memory.ts          # Memory system — read/write/query/compact
│   └── themeMap.ts        # Theme mapping
├── agents/                # Sample agent configs
│   └── scout.yaml
└── state/                 # Runtime state (auto-generated)
    ├── registry.json      # Active agents registry
    └── sessions/          # Persistent JSONL sessions
```

## Slash Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/orch add <yaml> <task>` | Spawn agent from YAML config | `/orch add scout "Explore the codebase"` |
| `/orch add <name> <task>` | Quick-spawn with inline config | `/orch add myagent "Do something"` |
| `/orch list` | List all active agents | `/orch list` |
| `/orch remove <id>` | Kill and remove an agent | `/orch remove 1` |
| `/orch status <id>` | Detailed agent status | `/orch status 1` |
| `/orch cont <id> <prompt>` | Continue agent conversation | `/orch cont 1 "Follow up"` |
| `/orch clear` | Remove all agents | `/orch clear` |
| `/orch memory` | View memory index | `/orch memory` |
| `/orch memory read <file>` | Read a memory file | `/orch memory read project.md` |
| `/orch memory query <term>` | Search memory | `/orch memory query "auth system"` |
| `/orch memory stats` | Show memory statistics | `/orch memory stats` |
| `/orch memory compact` | Compact memory files | `/orch memory compact` |
| `/orch memory summarize <file> <section>` | Summarize a section | `/orch memory summarize project.md Architecture` |

## Tool-Based API

The main agent can also orchestrate via these tools:

| Tool | Description |
|------|-------------|
| `orch_spawn` | Spawn an agent from YAML or inline config |
| `orch_list` | List all managed agents |
| `orch_remove` | Remove a specific agent |
| `orch_status` | Get detailed agent status |
| `orch_continue` | Continue an agent's conversation |
| `orch_memory_read` | Read memory from a file |
| `orch_memory_query` | Search memory for keywords |
| `orch_memory_compact` | Compact memory files |
| `orch_memory_stats` | Show memory statistics |

## Memory Architecture

```
<project>/.pi/agents/orch/memory/
├── MEMORY.md              # Index + session context (always loaded)
├── project.md             # Architecture, key files, dependencies
├── user.md                # User preferences, coding style
├── reference.md           # API contracts, configs, external services
├── feedback.md            # What worked, what didn't
└── decisions.md           # Architectural decisions and rationale
```

Memory is project-scoped — each project gets its own memory files. Agents read MEMORY.md index before starting, and the orchestrator writes findings after each agent completes.

## Architecture

```
Orchestrator (this extension)
  │
  ├── Agent #1: scout          ← spawn("pi", yaml-config → model/tools/prompt)
  │     ├── session: state/sessions/scout-1-1715000000000.jsonl
  │     ├── widget: live output
  │     └── proc: ChildProcess ref
  │
  ├── Agent #2: reviewer       ← same pattern
  │     ├── session: state/sessions/reviewer-1-1715000000000.jsonl
  │     ├── widget: live output
  │     └── proc: ChildProcess ref
  │
  └── ...
```

Each agent runs as a **separate `pi` process** with:
- `--mode json` for streaming output
- `--session <path>` for persistent conversation
- `--model` and `--tools` from YAML config
- `--no-extensions` to avoid recursive orchestration
