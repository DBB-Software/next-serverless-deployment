import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { CloudFrontRequestEvent, CloudFrontRequestCallback, CloudFrontRequest, Context } from 'aws-lambda'
import crypto from 'node:crypto'
import { CacheConfig } from '../types'
import {
  transformQueryToObject,
  transformCookiesToObject,
  getCurrentDeviceType,
  getFileExtensionTypeFromRequest
} from './utils/request'

const s3 = new S3Client({ region: process.env.S3_BUCKET_REGION! })

function buildCacheKey(keys: string[], data: Record<string, string | string[]>, prefix: string) {
  if (!keys.length) return null

  const cacheKeys = keys.reduce<string[]>((prev, curr) => (!data[curr] ? prev : [...prev, `${curr}=${data[curr]}`]), [])

  return !cacheKeys.length ? null : `${prefix}(${cacheKeys.join('-')})`
}

function getPageKeyFromRequest(request: CloudFrontRequest) {
  const key = request.uri.replace('/', '')

  // Home page in stored under `index` path
  if (!key) {
    return 'index'
  }

  // NextJS page router page data when do soft navigation.
  if (key.match('_next/data')) {
    return key.split(/_next\/data\/[a-zA-z0-9]+\//)[1].replace('.json', '')
  }

  return key
}

function getS3ObjectPath(request: CloudFrontRequest, cacheConfig: CacheConfig) {
  // Home page in stored under `index` path
  const pageKey = getPageKeyFromRequest(request)
  const fileExtension = getFileExtensionTypeFromRequest(request)

  const cacheKey = [
    cacheConfig.enableDeviceSplit ? getCurrentDeviceType(request.headers) : undefined,
    buildCacheKey(
      cacheConfig.cacheCookies?.toSorted() ?? [],
      transformCookiesToObject(request.headers.cookie),
      'cookie'
    ),
    buildCacheKey(cacheConfig.cacheQueries?.toSorted() ?? [], transformQueryToObject(request.querystring), 'query')
  ]
    .filter(Boolean)
    .join('-')
  const md5CacheKey = crypto.createHash('md5').update(cacheKey).digest('hex')

  return {
    s3Key: `${pageKey}/${md5CacheKey}.${fileExtension}`,
    cacheKey,
    md5CacheKey
  }
}

async function checkFileExistsInS3(
  s3Bucket: string,
  s3Key: string
): Promise<{ LastModified: Date | string; CacheControl: string } | null> {
  try {
    const { LastModified = '', CacheControl = '' } = await s3.send(
      new HeadObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key
      })
    )
    return { LastModified: LastModified!, CacheControl: CacheControl! }
  } catch (e) {
    if ((e as Error).name?.includes('NotFound')) return null

    throw e
  }
}

const shouldRevalidateFile = (s3FileMeta: { LastModified: Date | string; CacheControl: string } | null) => {
  if (!s3FileMeta) return false

  const { LastModified, CacheControl } = s3FileMeta

  const sMaxAgeMatch = CacheControl.match(/s-maxage=(\d+)/)
  const maxAgeMatch = CacheControl.match(/max-age=(\d+)/)
  const maxAge = sMaxAgeMatch ? parseInt(sMaxAgeMatch[1]) : maxAgeMatch ? parseInt(maxAgeMatch[1]) : 0

  const isFileExpired = Date.now() - new Date(LastModified).getTime() > maxAge * 1000

  return isFileExpired
}

export const handler = async (
  event: CloudFrontRequestEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
): Promise<void> => {
  const request = event.Records[0].cf.request
  const s3Bucket = process.env.S3_BUCKET!
  const cacheConfig = process.env.CACHE_CONFIG as CacheConfig
  const nextCachedRoutesMatchers = process.env.NEXT_CACHED_ROUTES_MATCHERS as unknown as string[]
  const { s3Key } = getS3ObjectPath(request, cacheConfig)
  const ebAppUrl = process.env.EB_APP_URL!

  const isCachedRoute = nextCachedRoutesMatchers.some((matcher) => RegExp(matcher).test(request.uri))

  try {
    // Check if file exists in S3 when route accepts caching.
    const s3FileMeta = isCachedRoute ? await checkFileExistsInS3(s3Bucket, s3Key) : false
    const shouldRenderFile = !s3FileMeta || shouldRevalidateFile(s3FileMeta)

    if (!shouldRenderFile) {
      // Modify s3 path request
      request.uri = `/${s3Key}`

      // If file exists, allow the request to proceed to S3
      callback(null, request)
    } else {
      request.origin = {
        custom: {
          domainName: ebAppUrl,
          port: 80,
          protocol: 'http',
          path: '',
          keepaliveTimeout: 5,
          readTimeout: 30,
          customHeaders: {},
          sslProtocols: ['TLSv1.2']
        }
      }

      request.headers['host'] = [{ key: 'host', value: ebAppUrl }]
      callback(null, request)
    }
  } catch (_e) {
    const error = _e as Error
    callback(null, {
      status: '500',
      statusDescription: 'Internal Server Error',
      body: `Error: ${error.message}`
    })
  }
}
