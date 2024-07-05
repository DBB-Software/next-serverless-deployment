import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { CloudFrontRequestEvent, CloudFrontRequestCallback, CloudFrontRequest, Context } from 'aws-lambda'
import http, { type RequestOptions } from 'http'
import { CacheConfig } from '../types'

const s3 = new S3Client({ region: process.env.S3_BUCKET_REGION! })

async function makeHTTPRequest(options: RequestOptions): Promise<{
  body: string
  statusCode?: number
  statusMessage?: string
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve({
          body: data,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage
        })
      })
    })

    req.on('error', (e) => {
      reject(e)
    })

    req.end()
  })
}

function convertCloudFrontHeaders(cloudfrontHeaders?: CloudFrontRequest['headers']): RequestOptions['headers'] {
  if (!cloudfrontHeaders) return {}

  return Object.keys(cloudfrontHeaders).reduce((prev, key) => {
    return {
      ...prev,
      [key]: cloudfrontHeaders[key][0].value
    }
  }, {})
}

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
  return keys.length ? `${prefix}(${keys.map((key) => `${key}=${data[key]}`).join('-')})` : ''
}

function getS3ObjectPath(request: CloudFrontRequest, cacheConfig: CacheConfig) {
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

  return {
    s3Key: `${pageKey}/${cacheKey}.${isJSON ? 'json' : 'html'}`,
    contentType: isJSON ? 'application/json' : 'text/html'
  }
}

export const handler = async (
  event: CloudFrontRequestEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
): Promise<void> => {
  const request = event.Records[0].cf.request
  const s3Bucket = process.env.S3_BUCKET!
  const cacheConfig = process.env.CACHE_CONFIG as CacheConfig
  const { s3Key, contentType } = getS3ObjectPath(request, cacheConfig)
  const ebAppUrl = process.env.EB_APP_URL!
  const originalUri = request.uri

  try {
    // Check if file exists in S3
    await s3.send(
      new HeadObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key
      })
    )
    // Modify s3 path request
    request.uri = `/${s3Key}`
    request.headers['content-type'] = [{ key: 'Content-Type', value: contentType }]

    // If file exists, allow the request to proceed to S3
    callback(null, request)
  } catch (_e) {
    const error = _e as Error
    if (error.name?.includes('NotFound')) {
      try {
        // If file does not exist, modify the request to go to Elastic Beanstalk
        const options: http.RequestOptions = {
          hostname: ebAppUrl,
          path: `${originalUri}${request.querystring ? `?${request.querystring}` : ''}`,
          method: request.method,
          headers: convertCloudFrontHeaders(request.headers)
        }

        const { body, statusCode, statusMessage } = await makeHTTPRequest(options)

        callback(null, {
          status: statusCode?.toString() || '500',
          statusDescription: statusMessage || 'Internal Server Error',
          body
        })
      } catch (beanstalkError) {
        callback(null, {
          status: '500',
          statusDescription: 'Internal Server Error',
          body: `Error: ${(beanstalkError as Error).message}`
        })
      }
    } else {
      callback(null, {
        status: '500',
        statusDescription: 'Internal Server Error',
        body: `Error: ${error.message}`
      })
    }
  }
}
