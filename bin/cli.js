#!/usr/bin/env node

import { getTasks, formatForClaudeHook, runTasks } from '../lib/index.js'
import { parseArgs } from 'util'

const { values, positionals } = parseArgs({
  options: {
    config: { type: 'string', short: 'c' },
    cwd: { type: 'string' },
    json: { type: 'boolean', short: 'j' },
    run: { type: 'boolean', short: 'r' },
    verbose: { type: 'boolean', short: 'v' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(`Usage: lint-staged-claude-hook [options] [files...]

Options:
  -c, --config <path>  Path to lint-staged config
  --cwd <path>         Working directory
  -r, --run            Execute the commands (default: just print)
  -v, --verbose        Show command output even on success
  -j, --json           Output as JSON
  -h, --help           Show help

When no files provided, reads Claude hook JSON from stdin.
Extracts file_path from tool_input automatically.

Claude hook config example (.claude/settings.json):
  {
    "hooks": {
      "PostToolUse": [{
        "matcher": { "tool_name": "Edit|Write" },
        "hooks": ["lint-staged-claude-hook --run"]
      }]
    }
  }`)
  process.exit(0)
}

async function getFilesFromStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  const input = Buffer.concat(chunks).toString('utf8').trim()
  if (!input) return []

  // Try Claude hook JSON format first
  try {
    const parsed = JSON.parse(input)
    const filePath = parsed.tool_input?.file_path
    if (filePath) return [filePath]
  } catch {
    // Not JSON, fall through to line-based parsing
  }

  return input.split('\n').filter(Boolean)
}

const files = positionals.length > 0 ? positionals : await getFilesFromStdin()

if (files.length === 0) {
  process.exit(0)
}

const cwd = values.cwd || process.cwd()

try {
  const tasks = await getTasks({
    files,
    cwd,
    configPath: values.config,
  })

  if (tasks.length === 0) {
    process.exit(0)
  }

  if (values.run) {
    const { success, results } = await runTasks({
      tasks,
      cwd,
      verbose: values.verbose,
    })

    if (values.json) {
      console.log(JSON.stringify({ success, results }, null, 2))
    } else {
      for (const r of results) {
        const status = r.success ? '✓' : '✗'
        console.log(`${status} ${r.command}`)
        if (r.error) console.error(`  ${r.error}`)
      }
    }

    process.exit(success ? 0 : 1)
  } else {
    const commands = formatForClaudeHook(tasks)

    if (values.json) {
      console.log(JSON.stringify({ tasks, commands }, null, 2))
    } else {
      for (const cmd of commands) {
        console.log(cmd)
      }
    }
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
