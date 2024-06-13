import fs from 'node:fs'
import path from 'node:path'
import { type ProjectSettings } from '../common/project'
import { buildNextApp } from '../build/next'

interface BuildAppOptions {
  outputPath: string
  s3BucketName: string
  projectSettings: ProjectSettings
}

const copyAssets = (outputPath: string, appPath: string) => {
  // Copying static assets (like js, css, images, .etc)
  fs.cpSync(path.join(appPath, '.next', 'static'), path.join(outputPath, '_next', 'static'), { recursive: true })

  fs.cpSync(path.join(appPath, '.next', 'standalone'), path.join(outputPath, 'server'), {
    recursive: true
  })
}

export const buildApp = async (options: BuildAppOptions) => {
  const { projectSettings, outputPath, s3BucketName } = options

  const { packager, nextConfigPath, projectPath } = projectSettings

  const cleanNextApp = await buildNextApp({
    packager,
    nextConfigPath,
    s3BucketName
  })

  copyAssets(outputPath, projectPath)

  return cleanNextApp
}
