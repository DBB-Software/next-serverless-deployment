import childProcess from 'node:child_process'
import fs from 'fs/promises'
import path from 'node:path'
import { type ProjectPackager, type ProjectSettings } from '../common/project'
import appRouterRevalidateTemplate from './cache/handlers/appRouterRevalidate'

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

const setNextEnvs = (s3BucketName: string) => {
  process.env.STATIC_BUCKET_NAME = s3BucketName
  process.env.NEXT_SERVERLESS_DEPLOYING_PHASE = 'true'
}

const appendRevalidateApi = async (projectPath: string, isAppDir: boolean): Promise<string> => {
  const routeFolderPath = path.join(projectPath, isAppDir ? 'src/app' : 'src', 'api', 'revalidate')
  const routePath = path.join(routeFolderPath, 'route.ts')

  await fs.mkdir(routeFolderPath, { recursive: true })
  await fs.writeFile(routePath, appRouterRevalidateTemplate, 'utf-8')

  return routePath
}

export const buildNext = async (options: BuildOptions): Promise<() => Promise<void>> => {
  const { packager, projectPath, s3BucketName, isAppDir } = options

  setNextEnvs(s3BucketName)
  const revalidateRoutePath = await appendRevalidateApi(projectPath, isAppDir)
  childProcess.execSync(packager.buildCommand, { stdio: 'inherit' })

  // Reverts changes to the next project
  return async () => {
    await fs.rm(revalidateRoutePath)
  }
}

const copyAssets = async (outputPath: string, appPath: string, appRelativePath: string) => {
  // Copying static assets (like js, css, images, .etc)
  await fs.cp(path.join(appPath, '.next'), path.join(outputPath, '.next'), {
    recursive: true
  })
  await fs.cp(
    path.join(appPath, '.next', 'static'),
    path.join(outputPath, '.next', 'standalone', appRelativePath, '.next', 'static'),
    {
      recursive: true
    }
  )
}

export const buildApp = async (options: BuildAppOptions) => {
  const { projectSettings, outputPath, s3BucketName } = options

  const { packager, nextConfigPath, projectPath, isAppDir, root, isMonorepo } = projectSettings

  const cleanNextApp = await buildNext({
    packager,
    nextConfigPath,
    s3BucketName,
    isAppDir,
    projectPath
  })

  const appRelativePath = isMonorepo ? path.relative(root, projectPath) : ''

  await copyAssets(outputPath, projectPath, appRelativePath)

  return cleanNextApp
}
