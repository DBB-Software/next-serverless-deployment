import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { CloudFrontRequestEvent, CloudFrontRequestCallback, CloudFrontRequest, Context } from 'aws-lambda'
import http, { type RequestOptions } from 'http'
import crypto from 'node:crypto'
import { CacheConfig } from '../types'
import { HEADER_DEVICE_TYPE } from '../constants'

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

function convertCloudFrontHeaders(
  cloudfrontHeaders: CloudFrontRequest['headers'] | undefined,
  allowHeaders?: string[]
): RequestOptions['headers'] {
  if (!cloudfrontHeaders) return {}

  return Object.keys(cloudfrontHeaders).reduce(
    (prev, key) =>
      !allowHeaders?.length || allowHeaders.includes(key)
        ? {
            ...prev,
            [key]: cloudfrontHeaders[key][0].value
          }
        : prev,
    {}
  )
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
  if (keys.length) {
    const cacheString = keys
      .map((key) => (data[key] ? `${key}=${data[key]}` : null))
      .filter(Boolean)
      .join('-')

    return cacheString ? `${prefix}(${cacheString})` : null
  }

  return null
}

function getCurrentDeviceType(headers: CloudFrontRequest['headers'] | undefined) {
  const deviceHeaders = convertCloudFrontHeaders(headers, Object.values(HEADER_DEVICE_TYPE))
  if (!deviceHeaders || !Object.keys(deviceHeaders).length) return null

  if (deviceHeaders[HEADER_DEVICE_TYPE.Desktop] === 'true') {
    return null
  } else if (deviceHeaders[HEADER_DEVICE_TYPE.Mobile] === 'true') {
    return 'mobile'
  } else if (deviceHeaders[HEADER_DEVICE_TYPE.Tablet] === 'true') {
    return 'tablet'
  } else if (deviceHeaders[HEADER_DEVICE_TYPE.SmartTV] === 'true') {
    return 'smarttv'
  }

  return null
}

function getS3ObjectPath(request: CloudFrontRequest, cacheConfig: CacheConfig) {
  // Home page in stored under `index` path
  const pageKey = request.uri.replace('/', '') || 'index'
  const isJSON = request.headers['content-type']?.[0]?.value?.includes('json')

  const cacheKey = [
    pageKey,
    cacheConfig.enableDeviceSplit ? getCurrentDeviceType(request.headers) : null,
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

async function checkFileExistsInS3(s3Bucket: string, s3Key: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key
      })
    )
    return true
  } catch (e) {
    if ((e as Error).name?.includes('NotFound')) return false

    throw e
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
  const { s3Key } = getS3ObjectPath(request, cacheConfig)
  const ebAppUrl = process.env.EB_APP_URL!
  const originalUri = request.uri

  try {
    // Check if file exists in S3
    const isFileExists = await checkFileExistsInS3(s3Bucket, s3Key)

    if (isFileExists) {
      // Modify s3 path request
      request.uri = `/${s3Key}`

      // If file exists, allow the request to proceed to S3
      callback(null, request)
    } else {
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
