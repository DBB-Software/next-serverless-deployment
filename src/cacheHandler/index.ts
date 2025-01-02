import { Cache } from '@dbbs/next-cache-handler-core'
import getConfig from 'next/config'
import { DeployConfig } from '../types'
import { S3Cache } from './strategy/s3'

const { serverRuntimeConfig } = getConfig() || {}
const config: DeployConfig | undefined = serverRuntimeConfig?.nextServerlessCacheConfig

Cache.setConfig({
  cacheCookies: config?.cache.cacheCookies ?? [],
  cacheQueries: config?.cache.cacheQueries ?? [],
  noCacheMatchers: config?.cache.noCacheRoutes ?? [],
  enableDeviceSplit: config?.cache.enableDeviceSplit,
  cache: new S3Cache(process.env.STATIC_BUCKET_NAME!)
})

export default Cache
