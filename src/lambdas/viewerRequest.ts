import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent } from 'aws-lambda'
import type { NextRedirects, NextI18nConfig } from '../types'
import path from 'node:path'

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
  const localesConfig = process.env.LOCALES_CONFIG as unknown as NextI18nConfig | null

  let shouldRedirectWithLocale = false
  let pagePath = request.uri
  let locale = ''
  let redirectTo = ''
  let redirectStatus = '307'

  if (localesConfig) {
    const [requestLocale, ...restPath] = request.uri.substring(1).split('/')
    shouldRedirectWithLocale = !localesConfig.locales.find((locale) => locale === requestLocale)

    if (!shouldRedirectWithLocale) {
      pagePath = `/${restPath.join('/')}`
      locale = requestLocale
    } else {
      locale = localesConfig.defaultLocale
    }
  }

  const redirect = redirectsConfig.find((r) => r.source === pagePath)

  if (redirect) {
    redirectTo = locale ? `/${path.join(locale, redirect.destination)}` : redirect.destination
    redirectStatus = redirect.statusCode ? String(redirect.statusCode) : redirect.permanent ? '308' : '307'
  } else if (shouldRedirectWithLocale) {
    redirectTo = `/${path.join(locale, pagePath)}`
  }

  if (redirectTo) {
    return callback(null, {
      status: redirectStatus,
      headers: {
        location: [
          {
            key: 'Location',
            value: `${redirectTo}${request.querystring ? `?${request.querystring}` : ''}`
          }
        ]
      }
    })
  }

  return callback(null, request)
}
