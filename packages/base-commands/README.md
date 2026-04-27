# pi-extensions/base-commands

Base slash commands for the Pi Agent.

## Installation

Drop this package into your Pi Agent extensions directory and it will auto-load:

```sh
# Clone or symlink the package
ln -s /path/to/pi-extensions/packages/base-commands ~/.pi/agent/extensions/base-commands
```

Or install from npm (once published):

```sh
pi install npm:@yourscope/pi-extensions-base-commands
```

## Available Commands

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/review-changes` | Review recent project changes for issues | Optional: custom focus areas (default: "security, performance, and correctness") |

### Examples

```
# Use default focus (security, performance, correctness)
/review-changes

# Custom focus
/review-changes type safety, error handling, and edge cases
```

## Adding New Commands

This package follows a simple pattern for registering slash commands. To add a new command:

1. Open `base-commands.ts`
2. Call `pi.registerCommand()` with a unique name, description, and handler:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("my-new-command", {
    description: "What this command does",
    handler: async (args, ctx) => {
      // Your logic here
    },
  });
}
```

3. Save the file — Pi Agent auto-reloads extensions on change.

## Structure

```
packages/base-commands/
├── README.md          # This file
├── base-commands.ts   # All registered slash commands
└── package.json       # Package metadata & dependencies
```
