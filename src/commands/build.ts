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

  fs.cpSync(path.join(appPath, '.next', 'standalone'), outputPath, {
    recursive: true
  })
  if (appRelativePath && appRelativePath !== '/') {
    fs.cpSync(path.join(outputPath, appRelativePath), outputPath, { recursive: true })
    fs.rmSync(path.join(outputPath, appRelativePath), { recursive: true })
  }
}

const modifyRunCommand = (outputPath: string) => {
  const packageFilePath = path.join(outputPath, 'package.json')

  const packageFile = JSON.parse(fs.readFileSync(packageFilePath, { encoding: 'utf-8' }).toString())

  // overrides start command to run simple node server
  packageFile.scripts.start = 'node ./server.js'

  fs.writeFileSync(packageFilePath, JSON.stringify(packageFile))
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
  modifyRunCommand(outputPath)

  return {
    outputPath,
    buildFolderName: OUTPUT_FOLDER
  }
}
