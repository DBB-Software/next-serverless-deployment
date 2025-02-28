import type { NextConfig } from 'next/types'
import type { RouteHas } from 'next/dist/lib/load-custom-routes'

export interface CacheConfig {
  noCacheRoutes?: string[]
  cacheCookies?: string[]
  cacheQueries?: string[]
  enableDeviceSplit?: boolean
}

export interface DeployConfig {
  cache: CacheConfig
  publicAssets?: {
    prefix: string
    ttl?: number
  }
}

export type NextRedirects = Awaited<ReturnType<Required<NextConfig>['redirects']>>

export type NextI18nConfig = NextConfig['i18n']

export type NextRewriteEntity = {
  source: string
  destination: string
  regex: string
  has?: RouteHas[]
}

export type NextRewrites = NextRewriteEntity[]
