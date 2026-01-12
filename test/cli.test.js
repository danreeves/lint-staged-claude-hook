import { describe, it } from 'node:test'
import assert from 'node:assert'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliPath = join(__dirname, '..', 'bin', 'cli.js')
const fixturesDir = join(__dirname, 'fixtures')

function runCli(args, stdin = null) {
  return new Promise((resolve) => {
    const proc = spawn('node', [cliPath, ...args], {
      cwd: fixturesDir,
      env: { ...process.env, NO_COLOR: '1' },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => (stdout += d))
    proc.stderr.on('data', (d) => (stderr += d))

    if (stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    }

    proc.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

describe('CLI', () => {
  describe('--help', () => {
    it('shows help text', async () => {
      const { code, stdout } = await runCli(['--help'])
      assert.equal(code, 0)
      assert.ok(stdout.includes('Usage:'))
      assert.ok(stdout.includes('--run'))
    })
  })

  describe('file arguments', () => {
    it('outputs commands for JS files', async () => {
      const { code, stdout } = await runCli(['test.js'])
      assert.equal(code, 0)
      assert.ok(stdout.includes('echo "js"'))
    })

    it('outputs commands for TS files', async () => {
      const { code, stdout } = await runCli(['test.ts'])
      assert.equal(code, 0)
      assert.ok(stdout.includes('echo "ts"'))
    })

    it('exits silently for non-matching files', async () => {
      const { code, stdout } = await runCli(['test.py'])
      assert.equal(code, 0)
      assert.equal(stdout, '')
    })

    it('handles multiple files', async () => {
      const { code, stdout } = await runCli(['a.js', 'b.js'])
      assert.equal(code, 0)
      assert.ok(stdout.includes('a.js'))
      assert.ok(stdout.includes('b.js'))
    })
  })

  describe('--json', () => {
    it('outputs JSON format', async () => {
      const { code, stdout } = await runCli(['--json', 'test.js'])
      assert.equal(code, 0)
      const data = JSON.parse(stdout)
      assert.ok(Array.isArray(data.tasks))
      assert.ok(Array.isArray(data.commands))
    })
  })

  describe('stdin input', () => {
    it('reads Claude hook JSON from stdin', async () => {
      const hookInput = JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: join(fixturesDir, 'test.js') },
      })
      const { code, stdout } = await runCli([], hookInput)
      assert.equal(code, 0)
      assert.ok(stdout.includes('echo "js"'))
    })

    it('handles stdin with no file_path', async () => {
      const hookInput = JSON.stringify({ tool_name: 'Read', tool_input: {} })
      const { code } = await runCli([], hookInput)
      assert.equal(code, 0) // exits silently
    })

    it('handles newline-separated file list', async () => {
      const fileList = 'test.js\ntest.ts'
      const { code, stdout } = await runCli([], fileList)
      assert.equal(code, 0)
      assert.ok(stdout.includes('echo "js"'))
      assert.ok(stdout.includes('echo "ts"'))
    })
  })

  describe('--run', () => {
    it('executes commands', async () => {
      const { code, stdout } = await runCli(['--run', 'test.js'])
      assert.equal(code, 0)
      assert.ok(stdout.includes('✓'))
      assert.ok(stdout.includes('echo "js"'))
    })

    it('reports failures', async () => {
      const { code } = await runCli(['--run', 'test.js'])
      // echo should succeed
      assert.equal(code, 0)
    })

    it('outputs JSON with --run --json', async () => {
      const { code, stdout } = await runCli(['--run', '--json', 'test.js'])
      assert.equal(code, 0)
      const data = JSON.parse(stdout)
      assert.equal(data.success, true)
      assert.ok(Array.isArray(data.results))
    })
  })

  describe('--config', () => {
    it('uses explicit config path', async () => {
      const { code, stdout } = await runCli(['-c', 'lint-staged.config.js', 'test.md'])
      assert.equal(code, 0)
      assert.ok(stdout.includes('echo "md"'))
    })
  })
})
