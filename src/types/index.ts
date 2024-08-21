export interface CacheConfig {
  noCacheRoutes?: string[]
  cacheCookies?: string[]
  cacheQueries?: string[]
  enableDeviceSplit?: boolean
}

export interface UpdateCloudFrontDistribution {
  staticBucketName?: string
  longCachePolicyId?: string
  splitCachePolicyId?: string
  routingFunctionArn?: string
  checkExpirationFunctionArn?: string
  addAdditionalBehaviour?: boolean
  skipDefaultBehavior?: boolean
}
