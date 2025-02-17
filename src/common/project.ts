import fs from 'node:fs'
import path from 'path'
import vm from 'node:vm'
import esbuild from 'esbuild'

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
  return ['next.config.js', 'next.config.mjs', 'next.config.ts'].find((config) =>
    fs.existsSync(path.join(appPath, config))
  )
}

const checkIsAppDir = (appPath: string): boolean => {
  return fs.existsSync(path.join(appPath, 'src', 'app'))
}

export const getProjectSettings = (projectPath: string): ProjectSettings | undefined => {
  let currentPath = projectPath
  const nextConfig = findNextConfig(projectPath)

  if (!nextConfig) {
    throw new Error('Could not find next.config.(js|mjs|ts)')
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
  if (filePath.endsWith('.ts')) {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const res = await esbuild.transform(fileContent, {
      target: 'es2022',
      format: 'cjs',
      platform: 'node',
      loader: 'ts'
    })
    const script = new vm.Script(res.code)
    const context = vm.createContext({ module: {}, exports: {}, require })
    script.runInContext(context)
    console.log({
      context,
      module: context.module,
      default: context.module.exports.default
    })
    return context.module.exports.default
  }

  return import(filePath).then((r) => r.default)
}
