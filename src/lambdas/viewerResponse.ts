import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent } from 'aws-lambda'

/**
 * Lambda@Edge viewer response handler that processes CloudFront responses.
 * This handler extracts the cache fragment key from x-amz-meta headers and
 * sets it as a standard Cache-Fragment-Key header while removing the original
 * x-amz-meta header.
 *
 * @param {CloudFrontResponseEvent} event - The CloudFront response event object
 * @param {Context} _context - AWS Lambda context object (unused)
 * @param {CloudFrontRequestCallback} callback - Callback to return the modified response
 * @returns {Promise<void>} - Returns nothing, uses callback to return response
 */
export const handler = async (
  event: CloudFrontResponseEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
) => {
  const response = event.Records[0].cf.response
  const fileCacheKey = response.headers['x-amz-meta-cache-fragment-key']?.[0].value

  if (fileCacheKey) {
    response.headers['cache-fragment-key'] = [{ key: 'Cache-Fragment-Key', value: fileCacheKey }]
    response.headers['x-amz-meta-cache-fragment-key'] = []
  }

  callback(null, response)
}
