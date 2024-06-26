import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { type ProjectPackager, type ProjectSettings } from '../common/project'
import loadConfig from '../commands/helpers/loadConfig'

interface BuildOptions {
  packager: ProjectPackager
  nextConfigPath: string
  s3BucketName: string
}

interface BuildAppOptions {
  outputPath: string
  s3BucketName: string
  projectSettings: ProjectSettings
}

export const OUTPUT_FOLDER = 'serverless-next'

const setNextOptions = async (nextConfig: string, s3BucketName: string) => {
  // set s3 bucket name for cache handler during build time
  process.env.STATIC_BUCKET_NAME = s3BucketName

  const serverConfig = await loadConfig()
  const currentConfig = await import(nextConfig).then((r) => r.default)
  const updatedConfig = {
    ...currentConfig,
    output: 'standalone',
    serverRuntimeConfig: {
      ...currentConfig.serverRuntimeConfig,
      cacheConfig: serverConfig
    },
    cacheHandler: require.resolve(path.join('..', 'cacheHandler', 'index.js'))
  }

  const currentContent = fs.readFileSync(nextConfig, 'utf-8')

  fs.writeFileSync(nextConfig, `module.exports = ${JSON.stringify(updatedConfig, null, 4)};\n`, 'utf-8')

  // function to revert back to original content of file.
  return () => {
    fs.writeFileSync(nextConfig, currentContent, 'utf-8')
  }
}

export const buildNext = async (options: BuildOptions) => {
  const { packager, nextConfigPath, s3BucketName } = options

  const clearNextConfig = await setNextOptions(nextConfigPath, s3BucketName)
  childProcess.execSync(packager.buildCommand, { stdio: 'inherit' })

  // Reverts changes to next project
  return clearNextConfig
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

  const cleanNextApp = await buildNext({
    packager,
    nextConfigPath,
    s3BucketName
  })

  copyAssets(outputPath, projectPath)

  return cleanNextApp
}
