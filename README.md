# lint-staged-claude-hook

Use your [lint-staged](https://github.com/lint-staged/lint-staged) config as a [Claude Code](https://claude.ai/code) hook.

## Install

```bash
npm install lint-staged-claude-hook
```

## Usage

### CLI

```bash
# Print commands for files
lint-staged-claude-hook src/index.js src/utils.js

# Execute commands
lint-staged-claude-hook --run src/index.js

# JSON output
lint-staged-claude-hook --json src/index.js
```

### As Claude Hook

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool_name": "Edit|Write" },
        "hooks": ["lint-staged-claude-hook --run"]
      }
    ]
  }
}
```

The CLI reads Claude's hook JSON from stdin, extracts `tool_input.file_path`, and runs your lint-staged commands.

## Options

```
-c, --config <path>  Path to lint-staged config
--cwd <path>         Working directory
-r, --run            Execute commands (default: print only)
-v, --verbose        Show output on success
-j, --json           JSON output
-h, --help           Show help
```

## License

MIT
