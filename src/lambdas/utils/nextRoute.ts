/* eslint-disable no-useless-escape */
import type { CloudFrontRequest } from 'aws-lambda'
import type { NextRewriteEntity, NextRewrites, NextRedirects } from '../../types'

/**
 * Validates if a request matches the specified route conditions
 * @param request - The CloudFront request object to validate
 * @param has - Array of conditions to check (headers, query params, cookies)
 * @returns boolean indicating if all conditions match
 */
export const validateRouteHasMatch = (request: CloudFrontRequest, has: NextRewriteEntity['has']) => {
  if (!has) return true

  return has.every((h) => {
    if (h.type === 'header') {
      const header = request.headers[h.key]

      return h.value ? header?.some((header) => header.value === h.value) : !!header
    }

    if (h.type === 'query' && request.querystring) {
      const searchParams = new URLSearchParams(request.querystring)

      return h.value ? searchParams.get(h.key) === h.value : searchParams.has(h.key)
    }

    if (h.type === 'cookie') {
      const cookies = request.headers.cookie?.[0].value

      return cookies?.includes(`${h.key}=${h.value ?? ''}`)
    }

    return false
  })
}

/**
 * Processes a request against rewrite/redirect rules to determine the updated route
 * @param request - The CloudFront request object to process
 * @param rules - Array of rewrite or redirect rules to apply
 * @param isTrailingSlashEnabled - Whether trailing slashes should be enforced
 * @returns Object containing the new URL and matched rule, or undefined if no match
 */
export const getUpdatedRoute = (
  request: CloudFrontRequest,
  rules: NextRewrites | NextRedirects,
  isTrailingSlashEnabled: boolean
) => {
  for (const rule of rules) {
    const { regex, has, source, destination } = rule
    const hasMatches = validateRouteHasMatch(request, has)

    if (hasMatches) {
      const regexFn = new RegExp(regex)
      const match = regexFn.exec(request.uri)

      if (match) {
        const paramNames = source.match(/\:(\w+)(\*)?/g)?.map((param) => param.replace(/[:*]/g, '')) || []

        // Create params object by mapping names to capture groups
        // First group [0] is full match, so we start from [1]
        const params = paramNames.reduce(
          (acc, name, index) => {
            acc[name] = match[index + 1] || ''
            return acc
          },
          {} as Record<string, string>
        )

        // Replace parameters in destination
        let updatedUrlDestintaion = destination.replace(/\:(\w+)(\*)?/g, (_, name) => {
          return params[name] || ''
        })
        const containsTrailingSlash = updatedUrlDestintaion.endsWith('/')

        if (isTrailingSlashEnabled && !containsTrailingSlash) {
          updatedUrlDestintaion = `${updatedUrlDestintaion}/`
        }

        if (!isTrailingSlashEnabled && containsTrailingSlash) {
          updatedUrlDestintaion = updatedUrlDestintaion.slice(0, -1)
        }

        return { newUrl: updatedUrlDestintaion, rule }
      }
    }
  }
}
