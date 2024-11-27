import type { NextConfig } from 'next/dist/server/config-shared'
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
        nextServerlessCacheConfig: cacheConfig,
        staticBucketName: process.env.STATIC_BUCKET_NAME
      },
      cacheHandler: require.resolve(path.join('..', 'cacheHandler', 'index.js'))
    }
  }

  return nextConfig
}
