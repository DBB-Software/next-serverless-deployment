import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent } from 'aws-lambda'
import type { NextRedirects, NextI18nConfig, NextRewrites } from '../types'
import path from 'node:path'
import { getUpdatedRoute } from './utils/nextRoute'

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
  const isTrailingSlashEnabled = process.env.IS_TRAILING_SLASH_ENABLED as unknown as boolean
  const nextRewritesConfig = process.env.NEXT_REWRITES_CONFIG as unknown as NextRewrites

  let shouldRedirectWithLocale = false
  let pagePath = request.uri

  if (request.uri.startsWith('/api/')) {
    return callback(null, request)
  }

  if (localesConfig) {
    const [requestLocale] = request.uri.substring(1).split('/')
    shouldRedirectWithLocale = !localesConfig.locales.includes(requestLocale)

    if (shouldRedirectWithLocale) {
      pagePath = path.join(`/${localesConfig.defaultLocale}`, pagePath)
    }
  }

  const redirectDestintaion = getUpdatedRoute({ ...request, uri: pagePath }, redirectsConfig, isTrailingSlashEnabled)

  if (redirectDestintaion || shouldRedirectWithLocale) {
    const redirectPath = redirectDestintaion ? redirectDestintaion.newUrl : pagePath
    const statusCode =
      redirectDestintaion && 'statusCode' in redirectDestintaion.rule
        ? String(redirectDestintaion.rule.statusCode)
        : '307'

    return callback(null, {
      status: statusCode,
      headers: {
        location: [{ key: 'Location', value: redirectPath }]
      }
    })
  }

  const rewrittenDestination = getUpdatedRoute(request, nextRewritesConfig, isTrailingSlashEnabled)

  if (rewrittenDestination) {
    request.uri = rewrittenDestination.newUrl
  }

  return callback(null, request)
}
