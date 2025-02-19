import {
  CachedRouteKind,
  CachedRedirectValue,
  IncrementalCachedPageValue,
  IncrementalCachedAppPageValue,
  CachedFetchValue,
  CachedRouteValue
} from '@dbbs/next-cache-handler-core'

export const mockRedirectCacheEntry: CachedRedirectValue = {
  kind: CachedRouteKind.REDIRECT,
  props: {}
}

export const mockPageCacheEntry: IncrementalCachedPageValue = {
  kind: CachedRouteKind.PAGE,
  html: '<p>My Page</p>',
  pageData: {},
  headers: {},
  status: 200
}

export const mockAppPageCacheEntry: IncrementalCachedAppPageValue = {
  kind: CachedRouteKind.APP_PAGE,
  html: '<p>My Page</p>',
  rscData: Buffer.from('123'),
  headers: {},
  postponed: undefined,
  status: 200,
  segmentData: undefined
}

export const mockFetchCacheEntry: CachedFetchValue = {
  kind: CachedRouteKind.FETCH,
  data: {
    url: 'https://example.com',
    headers: {},
    body: '123'
  },
  tags: [],
  revalidate: 1000
}

export const mockRouteCacheEntry: CachedRouteValue = {
  kind: CachedRouteKind.ROUTE,
  body: Buffer.from('123'),
  status: 200,
  headers: {}
}

export const mockAppRouteCacheEntry: CachedRouteValue = {
  kind: CachedRouteKind.APP_ROUTE,
  body: Buffer.from('123'),
  status: 200,
  headers: {}
}
