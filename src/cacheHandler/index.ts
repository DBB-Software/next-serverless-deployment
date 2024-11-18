import { Cache } from '@dbbs/next-cache-handler-core'
import getConfig from 'next/config'
import { CacheConfig } from '../types'
import { S3Cache } from './strategy/s3'

const { serverRuntimeConfig } = getConfig() || {}
const config: CacheConfig | undefined = serverRuntimeConfig?.nextServerlessCacheConfig

Cache.setConfig({
  cacheCookies: config?.cacheCookies ?? [],
  cacheQueries: config?.cacheQueries ?? [],
  noCacheMatchers: config?.noCacheRoutes ?? [],
  enableDeviceSplit: config?.enableDeviceSplit,
  cache: new S3Cache(process.env.STATIC_BUCKET_NAME!)
})

export default Cache
