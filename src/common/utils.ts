import crypto from 'node:crypto'
import type { CloudFrontRequest } from 'aws-lambda'
import { CacheConfig } from '../types'

function transformQueryToObject(query: string) {
    return query ? Object.fromEntries(new URLSearchParams(query).entries()) : {}
  }
  
  function transformCookiesToObject(cookies: Array<{ key?: string | undefined; value: string }>) {
    if (!cookies?.length) return {}
  
    return cookies.reduce(
      (res, { value }) => {
        value.split(';').forEach((cookie) => {
          const [key, val] = cookie.split('=').map((part) => part.trim())
          res[key] = val
        })
        return res
      },
      {} as Record<string, string>
    )
  }
  
  function buildCacheKey(keys: string[], data: Record<string, string | string[]>, prefix: string) {
    if (keys.length) {
      const cacheString = keys
        .map((key) => (data[key] ? `${key}=${data[key]}` : null))
        .filter(Boolean)
        .join('-')
  
      return cacheString ? `${prefix}(${cacheString})` : null
    }
  
    return null
  }
  
  export function getS3ObjectPath(request: CloudFrontRequest, cacheConfig: CacheConfig) {
    // Home page in stored under `index` path
    const pageKey = request.uri.replace('/', '') || 'index'
    const isJSON = request.headers['content-type']?.[0]?.value?.includes('json')
  
    const cacheKey = [
      pageKey,
      buildCacheKey(cacheConfig.cacheCookies ?? [], transformCookiesToObject(request.headers.cookie), 'cookie'),
      buildCacheKey(cacheConfig.cacheQueries ?? [], transformQueryToObject(request.querystring), 'query')
    ]
      .filter(Boolean)
      .join('-')
    const md5CacheKey = crypto.createHash('md5').update(cacheKey).digest('hex')
  
    return {
      s3Key: `${pageKey}/${md5CacheKey}.${isJSON ? 'json' : 'html'}`,
      contentType: isJSON ? 'application/json' : 'text/html',
      cacheKey,
      md5CacheKey
    }
  }
  