import { createRequire } from 'module'
import { resolve, dirname } from 'path'

const require = createRequire(import.meta.url)

// Resolve lint-staged lib path and import directly from file paths
const lintStagedMain = require.resolve('lint-staged')
const libDir = dirname(lintStagedMain)

const { searchConfigs } = await import(`file://${libDir}/searchConfigs.js`)
const { groupFilesByConfig } = await import(`file://${libDir}/groupFilesByConfig.js`)
const { generateTasks } = await import(`file://${libDir}/generateTasks.js`)
const { normalizePath } = await import(`file://${libDir}/normalizePath.js`)
const { getSpawnedTasks } = await import(`file://${libDir}/getSpawnedTasks.js`)
const { getSpawnedTask } = await import(`file://${libDir}/getSpawnedTask.js`)

export { searchConfigs, groupFilesByConfig, generateTasks, getSpawnedTasks, getSpawnedTask }

/**
 * Get tasks for given files using lint-staged config
 * @param {object} options
 * @param {string[]} options.files - files to process
 * @param {string} [options.cwd] - working directory
 * @param {string} [options.configPath] - explicit config path
 * @returns {Promise<Array<{pattern: string, commands: string[], fileList: string[]}>>}
 */
export async function getTasks({ files, cwd = process.cwd(), configPath }) {
  const configs = await searchConfigs({ cwd, configPath }, console)

  if (!configs || Object.keys(configs).length === 0) {
    throw new Error('No lint-staged config found')
  }

  // Normalize paths and convert to StagedFile format (v16 requires objects with filepath)
  const stagedFiles = files.map((f) => ({
    filepath: normalizePath(resolve(cwd, f)),
    status: 'M',
  }))

  const grouped = await groupFilesByConfig({
    configs,
    files: stagedFiles,
    singleConfigMode: configPath !== undefined,
  })

  const allTasks = []
  for (const [cfgPath, { config, files: configFiles }] of Object.entries(grouped)) {
    const tasks = generateTasks({
      config,
      cwd,
      files: configFiles,
      relative: true,
    })

    // Convert fileList from StagedFile[] to string[] for our API
    const convertedTasks = tasks
      .map((t) => ({
        pattern: t.pattern,
        commands: t.commands,
        fileList: t.fileList.map((f) => f.filepath),
      }))
      .filter((t) => t.fileList.length > 0)

    allTasks.push(...convertedTasks)
  }

  return allTasks
}

/**
 * Format tasks for Claude hook output
 */
export function formatForClaudeHook(tasks) {
  const commands = []
  for (const task of tasks) {
    for (const cmd of task.commands) {
      const expandedCmd =
        typeof cmd === 'function' ? cmd(task.fileList) : `${cmd} ${task.fileList.join(' ')}`
      commands.push(expandedCmd)
    }
  }
  return commands
}

/**
 * Run tasks using lint-staged's task runner
 * @param {object} options
 * @param {Array} options.tasks - tasks from getTasks()
 * @param {string} [options.cwd] - working directory
 * @param {boolean} [options.verbose] - show output even on success
 * @returns {Promise<{success: boolean, results: Array}>}
 */
export async function runTasks({ tasks, cwd = process.cwd(), verbose = false }) {
  const results = []
  let success = true

  for (const task of tasks) {
    // Convert fileList strings to StagedFile objects for getSpawnedTasks
    const files = task.fileList.map((filepath) => ({ filepath, status: 'M' }))

    const cmdTasks = await getSpawnedTasks({
      commands: task.commands,
      cwd,
      files,
      topLevelDir: cwd,
      verbose,
    })

    for (const cmdTask of cmdTasks) {
      try {
        await cmdTask.task()
        results.push({ command: cmdTask.command, success: true })
      } catch (err) {
        results.push({ command: cmdTask.command, success: false, error: err.message })
        success = false
      }
    }
  }

  return { success, results }
}
