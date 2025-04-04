import childProcess from 'node:child_process'
import fs from 'fs/promises'
import path from 'node:path'
import type { PrerenderManifest, RoutesManifest } from 'next/dist/build'
import { type ProjectPackager, type ProjectSettings } from '../common/project'
import { NextRewrites, NextRedirects } from '../types'

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
  await fs.cp(path.join(appPath, 'public'), path.join(outputPath, '.next', 'standalone', appRelativePath, 'public'), {
    recursive: true
  })
}

const getRewritesConfig = (manifestRules: RoutesManifest['rewrites']): NextRewrites => {
  if (!manifestRules) {
    return []
  }

  if (Array.isArray(manifestRules)) {
    return manifestRules.map((rule) => ({
      source: rule.source,
      destination: rule.destination,
      regex: rule.regex,
      has: rule.has
    }))
  }

  return [...manifestRules.beforeFiles, ...manifestRules.afterFiles, ...manifestRules.fallback].map((rule) => ({
    source: rule.source,
    destination: rule.destination,
    regex: rule.regex,
    has: rule.has
  }))
}

const getRedirectsConfig = (manifestRedirects: RoutesManifest['redirects']): NextRedirects => {
  if (!manifestRedirects) {
    return []
  }

  return manifestRedirects.map((rule) => ({
    source: rule.source,
    destination: rule.destination,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    regex: rule.regex, // nextjs still generates for manifest file regex to match the route
    statusCode: rule.statusCode ?? 307,
    has: rule.has
  }))
}

export const getNextCachedRoutesConfig = async (
  outputPath: string,
  appRelativePath: string
): Promise<{ cachedRoutesMatchers: string[]; rewritesConfig: NextRewrites; redirectsConfig: NextRedirects }> => {
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

  const locales = routesManifest.i18n?.locales ?? []

  const cachedRoutesMatchers = [...routesManifest.dynamicRoutes, ...routesManifest.staticRoutes].reduce(
    (prev, route) => {
      if (prerenderManifest.routes?.[route.page] || prerenderManifest.dynamicRoutes?.[route.page]) {
        if (locales.length) {
          prev.push(...locales.map((locale) => route.regex.replace('^', `^/${locale}`)))
        } else {
          prev.push(route.regex)
        }
      }

      return prev
    },
    [] as string[]
  )

  const rewritesConfig = getRewritesConfig(routesManifest.rewrites)

  const redirectsConfig = getRedirectsConfig(routesManifest.redirects)

  return { cachedRoutesMatchers, rewritesConfig, redirectsConfig }
}

export const buildApp = async (options: BuildAppOptions) => {
  const { projectSettings, outputPath } = options

  const { packager, projectPath, root, isMonorepo } = projectSettings

  await buildNext({
    packager
  })

  const appRelativePath = isMonorepo ? path.relative(root, projectPath) : ''

  await copyAssets(outputPath, projectPath, appRelativePath)
  const { cachedRoutesMatchers, rewritesConfig, redirectsConfig } = await getNextCachedRoutesConfig(
    outputPath,
    appRelativePath
  )

  return { cachedRoutesMatchers, rewritesConfig, redirectsConfig }
}
