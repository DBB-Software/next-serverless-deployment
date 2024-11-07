import fs from 'node:fs'
import path from 'path'

export interface ProjectPackager {
  type: 'npm' | 'yarn' | 'pnpm'
  lockFile: 'package-lock.json' | 'yarn.lock' | 'pnpm-lock.yaml'
  buildCommand: string
}

export interface ProjectSettings {
  root: string
  packager: ProjectPackager
  isMonorepo: boolean
  projectPath: string
  nextConfigPath: string
  isAppDir: boolean
}

export const findPackager = (appPath: string): ProjectPackager | undefined => {
  return (
    [
      { lockFile: 'package-lock.json', type: 'npm', buildCommand: 'npm run build' },
      { lockFile: 'yarn.lock', type: 'yarn', buildCommand: 'yarn build' },
      { lockFile: 'pnpm-lock.yaml', type: 'pnpm', buildCommand: 'pnpm build' }
    ] satisfies ProjectPackager[]
  ).find((packager) => fs.existsSync(path.join(appPath, `${packager.lockFile}`)))
}

export const findNextConfig = (appPath: string): string | undefined => {
  return ['next.config.js', 'next.config.mjs'].find((config) => fs.existsSync(path.join(appPath, config)))
}

const checkIsAppDir = (appPath: string): boolean => {
  return fs.existsSync(path.join(appPath, 'src', 'app'))
}

export const getProjectSettings = (projectPath: string): ProjectSettings | undefined => {
  let currentPath = projectPath
  const nextConfig = findNextConfig(projectPath)

  if (!nextConfig) {
    throw new Error('Could not find next.config.(js|mjs)')
  }

  while (currentPath !== '/') {
    const packager = findPackager(currentPath)

    if (packager) {
      return {
        root: currentPath,
        packager,
        isMonorepo: currentPath !== projectPath,
        projectPath,
        nextConfigPath: path.join(projectPath, nextConfig),
        isAppDir: checkIsAppDir(projectPath)
      }
    }

    currentPath = path.dirname(currentPath)
  }
}

export const loadFile = async (filePath: string) => {
  return import(filePath).then((r) => r.default)
}
