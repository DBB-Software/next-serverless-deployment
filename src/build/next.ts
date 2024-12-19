import childProcess from 'node:child_process'
import fs from 'fs/promises'
import path from 'node:path'
import type { PrerenderManifest, RoutesManifest } from 'next/dist/build'
import { type ProjectPackager, type ProjectSettings } from '../common/project'

interface BuildOptions {
  packager: ProjectPackager
}

interface BuildAppOptions {
  outputPath: string
  projectSettings: ProjectSettings
}

export const OUTPUT_FOLDER = 'serverless-next'

const setNextEnvs = () => {
  process.env.NEXT_SERVERLESS_DEPLOYING_PHASE = 'true'
}

export const buildNext = async (options: BuildOptions) => {
  const { packager } = options

  setNextEnvs()
  childProcess.execSync(packager.buildCommand, { stdio: 'inherit' })
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

export const getNextCachedRoutesMatchers = async (outputPath: string, appRelativePath: string): Promise<string[]> => {
  const prerenderManifestJSON = await fs.readFile(
    path.join(outputPath, '.next', 'standalone', appRelativePath, '.next', 'prerender-manifest.json'),
    'utf-8'
  )
  const routesManifestJSON = await fs.readFile(
    path.join(outputPath, '.next', 'standalone', appRelativePath, '.next', 'routes-manifest.json'),
    'utf-8'
  )

  const prerenderManifest = JSON.parse(prerenderManifestJSON) as PrerenderManifest
  const routesManifest = JSON.parse(routesManifestJSON) as RoutesManifest

  return [...routesManifest.dynamicRoutes, ...routesManifest.staticRoutes].reduce((prev, route) => {
    if (prerenderManifest.routes?.[route.page] || prerenderManifest.dynamicRoutes?.[route.page]) {
      prev.push(route.regex)
    }

    return prev
  }, [] as string[])
}

export const buildApp = async (options: BuildAppOptions) => {
  const { projectSettings, outputPath } = options

  const { packager, projectPath, root, isMonorepo } = projectSettings

  await buildNext({
    packager
  })

  const appRelativePath = isMonorepo ? path.relative(root, projectPath) : ''

  await copyAssets(outputPath, projectPath, appRelativePath)
  const nextCachedRoutesMatchers = await getNextCachedRoutesMatchers(outputPath, appRelativePath)

  return { nextCachedRoutesMatchers }
}
