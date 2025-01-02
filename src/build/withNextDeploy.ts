import type { NextConfig } from 'next/types'
import path from 'node:path'
import loadConfig from '../commands/helpers/loadConfig'

export const withNextDeploy = async (nextConfig: NextConfig): Promise<NextConfig> => {
  if (process.env.NEXT_SERVERLESS_DEPLOYING_PHASE === 'true') {
    const cacheConfig = await loadConfig()
    return {
      ...nextConfig,
      output: 'standalone',
      serverRuntimeConfig: {
        ...nextConfig.serverRuntimeConfig,
        nextServerlessCacheConfig: cacheConfig
      },
      cacheHandler: require.resolve(path.join('..', 'cacheHandler', 'index.js'))
    }
  }

  return nextConfig
}
