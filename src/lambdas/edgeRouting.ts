import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import type {
  CloudFrontRequestEvent,
  CloudFrontRequestCallback,
  CloudFrontRequestResult,
  CloudFrontRequest,
  Context
} from 'aws-lambda'
import https, { type RequestOptions } from 'https'

const s3 = new S3Client()

async function makeHTTPRequest(options: RequestOptions): Promise<{
  body: string
  statusCode?: number
  statusMessage?: string
}> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
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

  Object.keys(cloudfrontHeaders).reduce((prev, key) => {
    return {
      ...prev,
      [key]: cloudfrontHeaders[key]
    }
  }, {})
}

function getS3ObjectPath(uri: string) {
  const pageKey = uri.replace('/', '')

  // Home page leaves under `index` path
  if (!pageKey) {
    return 'index/index.html'
  }

  return `${pageKey}/${pageKey}.html`
}

export const handler = async (
  event: CloudFrontRequestEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
): Promise<void> => {
  const request = event.Records[0].cf.request
  const s3Bucket = process.env.S3_BUCKET as string
  const s3Key = getS3ObjectPath(request.uri)
  const ebAppUrl = process.env.EB_APP_URL as string

  try {
    // Check if file exists in S3
    await s3.send(
      new HeadObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key
      })
    )

    // Modify s3 path request
    request.uri = s3Key
    if (request.origin?.s3) {
      request.origin.s3 = {
        ...request.origin.s3,
        path: s3Key
      }
    }

    // If file exists, allow the request to proceed to S3
    callback(null, request)
  } catch (_e) {
    const error = _e as Error
    if (error.name === 'NotFound') {
      // If file does not exist, modify the request to go to Elastic Beanstalk
      const options: https.RequestOptions = {
        hostname: ebAppUrl,
        path: request.uri,
        method: request.method,
        headers: convertCloudFrontHeaders(request.headers)
      }

      const { body, statusCode, statusMessage } = await makeHTTPRequest(options)

      const response: CloudFrontRequestResult = {
        status: statusCode?.toString() || '500',
        statusDescription: statusMessage || 'Internal Server Error',
        body
      }

      callback(null, response)
    } else {
      // For other errors, return a 500 response
      const response: CloudFrontRequestResult = {
        status: '500',
        statusDescription: 'Internal Server Error',
        body: `Error: ${error.message}`
      }
      callback(null, response)
    }
  }
}
