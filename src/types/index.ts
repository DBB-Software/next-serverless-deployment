import type { NextConfig } from 'next/types'

export interface CacheConfig {
  noCacheRoutes?: string[]
  cacheCookies?: string[]
  cacheQueries?: string[]
  enableDeviceSplit?: boolean
}

export interface DeployConfig {
  internationalization?: {
    locales: string[]
    defaultLocale: string
  }
  cache: CacheConfig
}

export type NextRedirects = Awaited<ReturnType<Required<NextConfig>['redirects']>>
