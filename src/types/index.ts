import type { NextConfig } from 'next/types'

export interface CacheConfig {
  noCacheRoutes?: string[]
  cacheCookies?: string[]
  cacheQueries?: string[]
  enableDeviceSplit?: boolean
}

export interface DeployConfig {
  cache: CacheConfig
}

export type NextRedirects = Awaited<ReturnType<Required<NextConfig>['redirects']>>

export type NextI18nConfig = NextConfig['i18n']
