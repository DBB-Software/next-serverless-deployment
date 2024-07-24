import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { CloudFrontRequestEvent, CloudFrontRequestCallback, CloudFrontRequest, Context } from 'aws-lambda'
import http, { type RequestOptions } from 'http'
import { CacheConfig } from '../types'
import { getS3ObjectPath } from '../common/utils'

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
