import fs from 'node:fs'
import path from 'path'
import { getProjectSettings } from '../common/project'
import { buildNextApp } from '../build/next'

const OUTPUT_FOLDER = 'dbbs-next'

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
  if (appRelativePath && appRelativePath !== '/') {
    fs.cpSync(path.join(outputPath, 'server', appRelativePath), path.join(outputPath, 'server'), { recursive: true })
    fs.rmSync(path.join(outputPath, 'server', appRelativePath), { recursive: true })
  }
}

const modifyRunCommand = (outputPath: string) => {
  const packageFilePath = path.join(outputPath, 'server', 'package.json')

  const packageFile = JSON.parse(fs.readFileSync(packageFilePath, { encoding: 'utf-8' }).toString())

  // overrides start command to run simple node server
  packageFile.scripts.start = 'node ./server.js'

  fs.writeFileSync(packageFilePath, JSON.stringify(packageFile))
}

export const buildApp = async () => {
  const currentPath = process.cwd()
  const settings = getProjectSettings(currentPath)

  if (!settings) {
    throw new Error('Was not able to find project settings.')
  }

  const { packager, root: rootPath } = settings
  const appRelativePath = path.relative(rootPath, currentPath)
  const outputPath = createOutputFolder()

  buildNextApp(packager)
  copyAssets(outputPath, currentPath, appRelativePath)
  modifyRunCommand(outputPath)

  return {
    outputPath,
    buildFolderName: OUTPUT_FOLDER
  }
}
