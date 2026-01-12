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
const { makeCmdTasks } = await import(`file://${libDir}/makeCmdTasks.js`)
const { resolveTaskFn } = await import(`file://${libDir}/resolveTaskFn.js`)

export { searchConfigs, groupFilesByConfig, generateTasks, makeCmdTasks, resolveTaskFn }

/**
 * Get tasks for given files using lint-staged config
 * @param {object} options
 * @param {string[]} options.files - files to process
 * @param {string} [options.cwd] - working directory
 * @param {string} [options.configPath] - explicit config path
 * @returns {Promise<Array<{pattern: string, commands: string[], files: string[]}>>}
 */
export async function getTasks({ files, cwd = process.cwd(), configPath }) {
  const configs = await searchConfigs({ cwd, configPath }, console)

  if (!configs || Object.keys(configs).length === 0) {
    throw new Error('No lint-staged config found')
  }

  // Normalize paths like lint-staged does
  const normalizedFiles = files.map((f) => normalizePath(resolve(cwd, f)))

  const grouped = await groupFilesByConfig({
    configs,
    files: normalizedFiles,
    singleConfigMode: configPath !== undefined,
  })

  const allTasks = []
  for (const [cfgPath, { config, files: configFiles }] of Object.entries(grouped)) {
    const tasks = await generateTasks({
      config,
      cwd,
      files: configFiles,
      relative: true,
    })
    allTasks.push(...tasks.filter((t) => t.fileList.length > 0))
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
 * @param {boolean} [options.shell] - use shell mode
 * @param {boolean} [options.verbose] - show output even on success
 * @returns {Promise<{success: boolean, results: Array}>}
 */
export async function runTasks({ tasks, cwd = process.cwd(), shell = false, verbose = false }) {
  const results = []
  let success = true

  for (const task of tasks) {
    const cmdTasks = await makeCmdTasks({
      commands: task.commands,
      cwd,
      files: task.fileList,
      topLevelDir: cwd,
      shell,
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
