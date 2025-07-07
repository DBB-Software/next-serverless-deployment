import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent } from 'aws-lambda'

export const handler = async (
  event: CloudFrontResponseEvent,
  _context: Context,
  callback: CloudFrontRequestCallback
) => {
  const request = event.Records[0].cf.request

  return callback(null, request)
}
