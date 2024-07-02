import { Cache } from '@dbbs/next-cache-handler-core'
import { S3Cache } from '@dbbs/next-cache-handler-s3'
import getConfig from 'next/config'
import { CacheConfig } from '../types'

const { serverRuntimeConfig } = getConfig() || {}
const config: CacheConfig | undefined = serverRuntimeConfig?.nextServerlessCacheConfig

config?.noCacheRoutes?.forEach((route) => Cache.addNoCacheMatchers(route))
config?.cacheCookies?.forEach((cookie) => Cache.addCookie(cookie))
config?.cacheQueries?.forEach((query) => Cache.addQuery(query))

if (config?.enableDeviceSplit) {
  Cache.addDeviceSplit()
}

Cache.setCacheStrategy(new S3Cache(process.env.STATIC_BUCKET_NAME!))

export default Cache
