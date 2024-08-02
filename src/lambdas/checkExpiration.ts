import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent } from 'aws-lambda'

function checkFileIsExpired(date: string): boolean {
  if (date) {
    return new Date(date).getTime() < new Date().getTime()
  }

  return false
}

export const handler = async (
  event: CloudFrontResponseEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
): Promise<void> => {
  const response = event.Records[0].cf.response
  const headers = response.headers

  const expiresSrc = 'Expires'
  const cacheControlSrc = 'Cache-Control'

  try {
    // Check if file is expired
    if (headers[expiresSrc.toLowerCase()] && checkFileIsExpired(headers[expiresSrc.toLowerCase()][0].value)) {
      headers[cacheControlSrc.toLowerCase()] = [{ key: cacheControlSrc, value: 'no-cache' }]
    }
    callback(null, response)
  } catch (_e) {
    const error = _e as Error
    callback(null, {
      status: '500',
      statusDescription: 'Internal Server Error',
      body: `Error: ${error.message}`
    })
  }
}
