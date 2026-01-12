import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, 'fixtures')

const {
  getTasks,
  formatForClaudeHook,
  runTasks,
  searchConfigs,
  groupFilesByConfig,
  generateTasks,
} = await import('../lib/index.js')

describe('searchConfigs', () => {
  it('finds config in directory', async () => {
    const configs = await searchConfigs({ cwd: fixturesDir }, console)
    const configPaths = Object.keys(configs)
    assert.ok(configPaths.some((p) => p.includes('lint-staged.config.js')))
  })

  it('loads config with explicit path', async () => {
    const configPath = join(fixturesDir, 'lint-staged.config.js')
    const configs = await searchConfigs({ cwd: fixturesDir, configPath }, console)
    assert.ok(Object.keys(configs).length > 0)
  })
})

describe('getTasks', () => {
  it('returns tasks for matching JS files', async () => {
    const configPath = join(fixturesDir, 'lint-staged.config.js')
    const tasks = await getTasks({
      files: ['test.js'],
      cwd: fixturesDir,
      configPath,
    })

    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].pattern, '*.js')
    assert.deepEqual(tasks[0].commands, ['echo "js"'])
    assert.ok(tasks[0].fileList.some((f) => f.endsWith('test.js')))
  })

  it('returns tasks for matching TS files', async () => {
    const configPath = join(fixturesDir, 'lint-staged.config.js')
    const tasks = await getTasks({
      files: ['test.ts'],
      cwd: fixturesDir,
      configPath,
    })

    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].pattern, '*.ts')
  })

  it('returns empty for non-matching files', async () => {
    const configPath = join(fixturesDir, 'lint-staged.config.js')
    const tasks = await getTasks({
      files: ['test.py'],
      cwd: fixturesDir,
      configPath,
    })

    assert.equal(tasks.length, 0)
  })

  it('handles multiple files', async () => {
    const configPath = join(fixturesDir, 'lint-staged.config.js')
    const tasks = await getTasks({
      files: ['a.js', 'b.js', 'c.ts'],
      cwd: fixturesDir,
      configPath,
    })

    assert.equal(tasks.length, 2) // one for *.js, one for *.ts
    const jsTask = tasks.find((t) => t.pattern === '*.js')
    const tsTask = tasks.find((t) => t.pattern === '*.ts')
    assert.equal(jsTask.fileList.length, 2)
    assert.equal(tsTask.fileList.length, 1)
  })
})

describe('formatForClaudeHook', () => {
  it('formats tasks as command strings', () => {
    const tasks = [
      { pattern: '*.js', commands: ['eslint', 'prettier'], fileList: ['a.js', 'b.js'] },
    ]
    const commands = formatForClaudeHook(tasks)

    assert.equal(commands.length, 2)
    assert.equal(commands[0], 'eslint a.js b.js')
    assert.equal(commands[1], 'prettier a.js b.js')
  })

  it('handles function commands', () => {
    const tasks = [
      {
        pattern: '*.js',
        commands: [(files) => `custom ${files.join(',')}`],
        fileList: ['a.js', 'b.js'],
      },
    ]
    const commands = formatForClaudeHook(tasks)

    assert.equal(commands.length, 1)
    assert.equal(commands[0], 'custom a.js,b.js')
  })
})

describe('runTasks', () => {
  it('runs echo commands successfully', async () => {
    const tasks = [{ pattern: '*.js', commands: ['echo "test"'], fileList: ['a.js'] }]
    const { success, results } = await runTasks({ tasks, shell: true })

    assert.equal(success, true)
    assert.equal(results.length, 1)
    assert.equal(results[0].success, true)
  })

  it('reports failure for missing commands', async () => {
    const tasks = [{ pattern: '*.js', commands: ['nonexistent-cmd-12345'], fileList: ['a.js'] }]
    const { success, results } = await runTasks({ tasks })

    assert.equal(success, false)
    assert.equal(results[0].success, false)
    assert.ok(results[0].error)
  })

  it('runs multiple commands in sequence', async () => {
    const tasks = [
      { pattern: '*.js', commands: ['echo "first"', 'echo "second"'], fileList: ['a.js'] },
    ]
    const { success, results } = await runTasks({ tasks, shell: true })

    assert.equal(success, true)
    assert.equal(results.length, 2)
  })
})
