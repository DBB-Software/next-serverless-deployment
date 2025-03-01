import fs from 'node:fs'
import path from 'node:path'
import type { DeployConfig } from '../../types'

export const findConfig = (configPath: string): string | undefined => {
  return ['next-serverless.config.js', 'next-serverless.config.mjs', 'next-serverless.config.ts'].find((config) =>
    fs.existsSync(path.join(configPath, config))
  )
}

async function loadConfig(): Promise<DeployConfig> {
  try {
    const serverConfig = findConfig(process.cwd())

    if (!serverConfig) {
      throw new Error('Could not find next-serverless.config.(js|mjs|ts)')
    }

    const configPath = path.join(process.cwd(), serverConfig)
    return import(configPath).then((r) => r.default)
  } catch (e) {
    throw new Error('Could not load next-serverless.config.(js|mjs|ts)')
  }
}

export default loadConfig
