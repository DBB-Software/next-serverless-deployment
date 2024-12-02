import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent } from 'aws-lambda'
import type { NextRedirects } from '../types'

/**
 * AWS Lambda@Edge Viewer Request handler for Next.js redirects
 * This function processes CloudFront viewer requests and handles redirects configured in Next.js
 *
 * @param {CloudFrontResponseEvent} event - The CloudFront event object containing request details
 * @param {Context} _context - AWS Lambda Context object (unused)
 * @param {CloudFrontRequestCallback} callback - Callback function to return the response
 * @returns {Promise<void>} - Returns either a redirect response or the original request
 */
export const handler = async (
  event: CloudFrontResponseEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
) => {
  const request = event.Records[0].cf.request
  const redirectsConfig = process.env.REDIRECTS as unknown as NextRedirects

  const redirect = redirectsConfig.find((r) => r.source === request.uri)

  if (redirect) {
    return callback(null, {
      status: redirect.statusCode ? String(redirect.statusCode) : redirect.permanent ? '308' : '307',
      headers: {
        location: [{ key: 'Location', value: redirect.destination }]
      }
    })
  }

  return callback(null, request)
}
