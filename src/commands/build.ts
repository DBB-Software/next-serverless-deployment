import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'path'
import { getProjectSettings, ProjectPackager } from '../utils'

const OUTPUT_FOLDER = 'dbbs-next'

const setNextOptions = () => {
  // Same as `target: "standalone"` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = 'true'
}

const buildNextApp = (packager: ProjectPackager) => {
  childProcess.execSync(packager.buildCommand, { stdio: 'inherit' })
}

const createOutputFolder = () => {
  const outputFolderPath = path.join(process.cwd(), OUTPUT_FOLDER)
  // clean folder before creating new build output.
  fs.rmSync(outputFolderPath, { recursive: true, force: true })

  fs.mkdirSync(outputFolderPath)

  return outputFolderPath
}

const copyAssets = (outputPath: string, appPath: string, appRelativePath: string) => {
  // Copying static assets (like js, css, images, .etc)
  fs.cpSync(path.join(appPath, '.next', 'static'), path.join(outputPath, '_next', 'static'), { recursive: true })

  fs.cpSync(path.join(appPath, '.next', 'standalone'), path.join(outputPath, 'server'), {
    recursive: true
  })
  fs.cpSync(path.join(outputPath, 'server', appRelativePath), path.join(outputPath, 'server'), { recursive: true })
  fs.rmSync(path.join(outputPath, 'server', appRelativePath), { recursive: true })
}

export const buildApp = () => {
  const currentPath = process.cwd()
  const settings = getProjectSettings(currentPath)

  if (!settings) {
    throw new Error('Was not able to find project settings.')
  }

  const { packager, root: rootPath } = settings
  const appRelativePath = path.relative(rootPath, currentPath)

  setNextOptions()
  buildNextApp(packager)
  const outputPath = createOutputFolder()
  copyAssets(outputPath, currentPath, appRelativePath)
}
