import childProcess from 'node:child_process'
import fs from 'fs/promises'
import path from 'node:path'
import { type ProjectPackager, type ProjectSettings, loadFile } from '../common/project'
import loadConfig from '../commands/helpers/loadConfig'
import appRouterRevalidate from './cache/handlers/appRouterRevalidate'

interface BuildOptions {
  packager: ProjectPackager
  nextConfigPath: string
  s3BucketName: string
  isAppDir: boolean
  projectPath: string
}

interface BuildAppOptions {
  outputPath: string
  s3BucketName: string
  projectSettings: ProjectSettings
}

export const OUTPUT_FOLDER = 'serverless-next'

const setNextOptions = async (nextConfigPath: string, s3BucketName: string): Promise<() => Promise<void>> => {
  // set s3 bucket name for cache handler during build time
  process.env.STATIC_BUCKET_NAME = s3BucketName

  const cacheConfig = await loadConfig()
  const currentConfig = await loadFile(nextConfigPath)
  const updatedConfig = {
    ...currentConfig,
    output: 'standalone',
    serverRuntimeConfig: {
      ...currentConfig.serverRuntimeConfig,
      nextServerlessCacheConfig: cacheConfig
    },
    cacheHandler: require.resolve(path.join('..', 'cacheHandler', 'index.js'))
  }

  const currentContent = await fs.readFile(nextConfigPath, 'utf-8')

  let updatedContent = `module.exports = ${JSON.stringify(updatedConfig, null, 4)};\n`

  // Check if the file has .mjs extension
  if (nextConfigPath.endsWith('.mjs')) {
    updatedContent = `export default ${JSON.stringify(updatedConfig, null, 4)};\n`
  }

  await fs.writeFile(nextConfigPath, updatedContent, 'utf-8')

  // Function to revert back to original content of file
  return async () => {
    fs.writeFile(nextConfigPath, currentContent, 'utf-8')
  }
}

const appendRevalidateApi = async (projectPath: string, isAppDir: boolean): Promise<string> => {
  const routeFolderPath = path.join(projectPath, isAppDir ? 'src/app' : 'src', 'api', 'revalidate')
  const routePath = path.join(routeFolderPath, 'route.ts')
  if ((await fs.stat(routeFolderPath)).isDirectory()) {
    await fs.mkdir(routeFolderPath, { recursive: true })
  }

  fs.writeFile(routePath, appRouterRevalidate, 'utf-8')

  return routePath
}

export const buildNext = async (options: BuildOptions): Promise<() => Promise<void>> => {
  const { packager, nextConfigPath, s3BucketName, projectPath, isAppDir } = options

  const revalidateRoutePath = await appendRevalidateApi(projectPath, isAppDir)
  const clearNextConfig = await setNextOptions(nextConfigPath, s3BucketName)
  childProcess.execSync(packager.buildCommand, { stdio: 'inherit' })

  // Reverts changes to the next project
  return async () => {
    await Promise.all([clearNextConfig(), fs.rm(revalidateRoutePath)])
  }
}

const copyAssets = async (outputPath: string, appPath: string) => {
  // Copying static assets (like js, css, images, .etc)
  await Promise.all([
    fs.cp(path.join(appPath, '.next', 'static'), path.join(outputPath, '_next', 'static'), { recursive: true }),
    fs.cp(path.join(appPath, '.next', 'standalone'), path.join(outputPath, 'server'), {
      recursive: true
    })
  ])
}

export const buildApp = async (options: BuildAppOptions) => {
  const { projectSettings, outputPath, s3BucketName } = options

  const { packager, nextConfigPath, projectPath, isAppDir } = projectSettings

  const cleanNextApp = await buildNext({
    packager,
    nextConfigPath,
    s3BucketName,
    isAppDir,
    projectPath
  })

  await copyAssets(outputPath, projectPath)

  return cleanNextApp
}
