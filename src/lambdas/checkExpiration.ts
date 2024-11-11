import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent, CloudFrontHeaders } from 'aws-lambda'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

const sqs = new SQSClient({ region: process.env.QUEUE_REGION! })

/**
 * Checks if a file is expired based on HTTP headers
 * @param headers - Object containing HTTP headers
 * @param headers.expires - Expires header value
 * @param headers['cache-control'] - Cache-Control header value
 * @param headers['last-modified'] - Last-Modified header value
 * @returns boolean indicating if the file is expired
 */
function checkFileIsExpired(headers: CloudFrontHeaders): boolean {
  const expiresHeader = headers['expires'] ? headers['expires'][0].value : null
  const cacheControlHeader = headers['cache-control'] ? headers['cache-control'][0].value : null
  const lastModifiedHeader = headers['last-modified'] ? headers['last-modified'][0].value : null
  const now = Date.now()

  // Check Expires header
  if (expiresHeader && new Date(expiresHeader).getTime() <= now) {
    return true
  }

  // Check Cache-Control: max-age
  if (cacheControlHeader && lastModifiedHeader) {
    const maxAgeMatch = cacheControlHeader.match(/max-age=(\d+)/)
    if (maxAgeMatch) {
      const maxAgeSeconds = parseInt(maxAgeMatch[1], 10)
      const responseDate = new Date(lastModifiedHeader).getTime()
      const expiryTime = responseDate + maxAgeSeconds * 1000

      return expiryTime <= now
    }
  }

  return false
}

/**
 * Extracts the page router path from an S3 URI by removing the cache hash
 * @param {string} s3Uri - The S3 URI containing the full path (e.g., '/blog/post/abc123')
 * @returns {string} The cleaned router path without cache hash. Special case: returns '/' for '/index'
 *
 * @description
 * This function processes S3 URIs by:
 * 1. Splitting the path into segments
 * 2. Removing the last segment (cache hash)
 * 3. Building actual NextJS page path
 */
function getPageRouterPath(s3Uri: string) {
  const path = s3Uri.split('/').slice(0, -1).join('/')
  return path === '/index' ? '/' : path
}

/**
 * Lambda handler for checking file expiration in CloudFront responses
 * @param event - CloudFront response event
 * @param _context - Lambda context
 * @param callback - CloudFront request callback
 * @returns Promise<void>
 *
 * @throws Will throw an error if SQS message sending fails
 */
export const handler = async (
  event: CloudFrontResponseEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
): Promise<void> => {
  const response = event.Records[0].cf.response
  const request = event.Records[0].cf.request
  const headers = response.headers

  try {
    // Check if file is expired using Expires or Cache-Control headers
    if (checkFileIsExpired(headers)) {
      headers['cache-control'] = [{ key: 'Cache-Control', value: 'no-cache' }]

      // Send message to SQS for page revalidation.
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.RENDER_QUEUE_URL!,
          MessageBody: JSON.stringify({
            path: `${getPageRouterPath(request.uri)}${request.querystring ? `?${request.querystring}` : ''}`
          })
        })
      )
    }

    callback(null, response)
  } catch (error) {
    callback(null, {
      status: '500',
      statusDescription: 'Internal Server Error',
      body: `Error: ${(error as Error).message}`
    })
  }
}
