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
  healthCheckPath?: string
  publicAssets?: {
    prefix: string
    ttl?: number
  }
}

export type NextI18nConfig = NextConfig['i18n']

export type NextRewriteEntity = {
  source: string
  destination: string
  regex: string
  has?: RouteHas[]
}

export type NextRedirectEntity = {
  source: string
  destination: string
  has?: RouteHas[]
  regex: string
  statusCode: number
}

export type NextRewrites = NextRewriteEntity[]

export type NextRedirects = NextRedirectEntity[]
