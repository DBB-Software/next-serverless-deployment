import { Cache, NextCacheHandlerContext } from '@dbbs/next-cache-handler-core'
import { S3Cache } from '@dbbs/next-cache-handler-s3'
import getConfig from 'next/config'
import { CacheConfig } from '../types'

const { serverRuntimeConfig } = getConfig() || {}
const config: CacheConfig = serverRuntimeConfig?.nextServerlessCacheConfig

class ServerlessCache extends Cache {
  constructor(props: NextCacheHandlerContext) {
    super(props)
  }

  static addNoCacheRoutes(routes: string[] = []) {
    this.noCacheRoutes = this.noCacheRoutes.concat(routes)
    return this
  }

  static addCacheCookies(cookies: string[] = []) {
    this.cacheCookies = this.cacheCookies.concat(cookies)
    return this
  }

  static addCacheQueries(queries: string[] = []) {
    this.cacheQueries = this.cacheQueries.concat(queries)
    return this
  }

  static addDeviceSplit(split: boolean = false) {
    this.enableDeviceSplit = split
    return this
  }
}

ServerlessCache.addNoCacheRoutes(config?.noCacheRoutes)
  .addCacheCookies(config?.cacheCookies)
  .addCacheQueries(config?.cacheQueries)
  .addDeviceSplit(config?.enableDeviceSplit)
  .setCacheStrategy(new S3Cache(process.env.STATIC_BUCKET_NAME!))

export default ServerlessCache
