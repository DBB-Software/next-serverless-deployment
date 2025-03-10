import { type RequestOptions } from 'http'
import type { CloudFrontRequest } from 'aws-lambda'
import { HEADER_DEVICE_TYPE } from '../../constants'

/**
 * Converts CloudFront headers to standard HTTP request headers
 * @param {CloudFrontRequest['headers'] | undefined} cloudfrontHeaders - Headers from CloudFront request
 * @param {string[]} [allowHeaders] - Optional array of allowed header keys to filter
 * @returns {RequestOptions['headers']} Converted headers object
 */
export function convertCloudFrontHeaders(
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

/**
 * Transforms a query string into an object
 * @param {string} query - URL query string
 * @returns {Record<string, string>} Object containing query parameters
 */
export function transformQueryToObject(query: string) {
  return query ? Object.fromEntries(new URLSearchParams(query).entries()) : {}
}

/**
 * Transforms an array of cookies into a single cookie object
 * @param {Array<{ key?: string | undefined; value: string }>} cookies - Array of cookie objects
 * @returns {Record<string, string>} Object containing cookie key-value pairs
 */
export function transformCookiesToObject(cookies: Array<{ key?: string | undefined; value: string }>) {
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

/**
 * Determines the current device type based on CloudFront request headers
 * @param {CloudFrontRequest['headers'] | undefined} headers - CloudFront request headers
 * @returns {'mobile' | 'tablet' | 'smarttv' | null} Device type or null if not determined
 */
export function getCurrentDeviceType(headers: CloudFrontRequest['headers'] | undefined) {
  const deviceHeaders = convertCloudFrontHeaders(headers, Object.values(HEADER_DEVICE_TYPE))
  if (!deviceHeaders || !Object.keys(deviceHeaders).length) return

  if (deviceHeaders[HEADER_DEVICE_TYPE.Desktop] === 'true') {
    return
  } else if (deviceHeaders[HEADER_DEVICE_TYPE.Mobile] === 'true') {
    return 'mobile'
  } else if (deviceHeaders[HEADER_DEVICE_TYPE.Tablet] === 'true') {
    return 'tablet'
  } else if (deviceHeaders[HEADER_DEVICE_TYPE.SmartTV] === 'true') {
    return 'smarttv'
  }

  return
}

/**
 * Determines the file extension type from a CloudFront request
 * @param {CloudFrontRequest} request - CloudFront request object
 * @returns {'rsc' | 'json' | 'html'} File extension type
 */
export function getFileExtensionTypeFromRequest(request: CloudFrontRequest) {
  const contentType = request.headers['content-type']?.[0]?.value ?? ''
  const isRSC = request.querystring.includes('_rsc')

  if (isRSC) {
    return 'rsc'
  }

  if (contentType.includes('json') || request.uri.endsWith('.json')) {
    return 'json'
  }

  return 'html'
}
