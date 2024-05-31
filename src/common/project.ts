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
}

export const findPackager = (appPath: string): ProjectPackager | undefined => {
  return (
    [
      { lockFile: 'package-lock.json', type: 'npm', buildCommand: 'npm ru build' },
      { lockFile: 'yarn.lock', type: 'yarn', buildCommand: 'yarn build' },
      { lockFile: 'pnpm-lock.yaml', type: 'pnpm', buildCommand: 'pnpm build' }
    ] satisfies ProjectPackager[]
  ).find((packager) => fs.existsSync(path.join(appPath, `${packager.lockFile}`)))
}

export const getProjectSettings = (projectPath: string): ProjectSettings | undefined => {
  let currentPath = projectPath

  while (currentPath !== '/') {
    const packager = findPackager(currentPath)

    if (packager) {
      return { root: currentPath, packager, isMonorepo: currentPath !== projectPath }
    }

    currentPath = path.dirname(currentPath)
  }
}
