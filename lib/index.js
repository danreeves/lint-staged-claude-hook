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

/** Convert filepath string to StagedFile object (v16 format) */
function toStagedFile(filepath) {
  return { filepath, status: 'M' }
}

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

  const stagedFiles = files.map(function (f) {
    return toStagedFile(normalizePath(resolve(cwd, f)))
  })

  const grouped = await groupFilesByConfig({
    configs,
    files: stagedFiles,
    singleConfigMode: configPath !== undefined,
  })

  return Object.values(grouped).flatMap(function ({ config, files: configFiles }) {
    return generateTasks({ config, cwd, files: configFiles, relative: true })
      .map(function (t) {
        return {
          pattern: t.pattern,
          commands: t.commands,
          fileList: t.fileList.map(function (f) { return f.filepath }),
        }
      })
      .filter(function (t) { return t.fileList.length > 0 })
  })
}

/**
 * Format tasks as shell commands for Claude hook
 * @param {Array} tasks - tasks from getTasks()
 * @returns {string[]}
 */
export function formatForClaudeHook(tasks) {
  return tasks.flatMap(function (task) {
    return task.commands.map(function (cmd) {
      if (typeof cmd === 'function') {
        return cmd(task.fileList)
      }
      return `${cmd} ${task.fileList.join(' ')}`
    })
  })
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
    const files = task.fileList.map(toStagedFile)

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
