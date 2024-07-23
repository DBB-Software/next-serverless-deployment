import { Construct } from 'constructs'
import { Duration } from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { addOutput } from '../../common/cdk'
import { CacheConfig } from '../../types'
import { HEADER_DEVICE_TYPE } from '../../constants'

interface CloudFrontPropsDistribution {
  staticBucket: s3.IBucket
  ebAppDomain: string
  edgeFunction: cloudfront.experimental.EdgeFunction
  cacheConfig: CacheConfig
}

const OneMonthCache = Duration.days(30)
const NoCache = Duration.seconds(0)

export class CloudFrontDistribution extends Construct {
  public readonly cf: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: CloudFrontPropsDistribution) {
    super(scope, id)

    const { staticBucket, edgeFunction, cacheConfig } = props

    const splitCachePolicy = new cloudfront.CachePolicy(this, 'SplitCachePolicy', {
      cachePolicyName: `${id}-SplitCachePolicy`,
      queryStringBehavior: cacheConfig.cacheQueries?.length
        ? cloudfront.CacheQueryStringBehavior.allowList(...cacheConfig.cacheQueries)
        : cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cacheConfig.cacheCookies?.length
        ? cloudfront.CacheCookieBehavior.allowList(...cacheConfig.cacheCookies)
        : cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Cache-Control', ...Object.values(HEADER_DEVICE_TYPE)),
      minTtl: NoCache,
      defaultTtl: NoCache // no caching by default, cache value is going to be used from Cache-Control header.
    })

    const longCachePolicy = new cloudfront.CachePolicy(this, 'LongCachePolicy', {
      cachePolicyName: `${id}-LongCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      defaultTtl: OneMonthCache,
      maxTtl: OneMonthCache,
      minTtl: OneMonthCache
    })

    const s3Origin = new origins.S3Origin(staticBucket)

    this.cf = new cloudfront.Distribution(this, id, {
      defaultBehavior: {
        origin: s3Origin,
        edgeLambdas: [
          {
            functionVersion: edgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST
          }
        ],
        cachePolicy: splitCachePolicy
      },
      defaultRootObject: '',
      additionalBehaviors: {
        '/_next/*': {
          origin: s3Origin,
          cachePolicy: longCachePolicy
        }
      }
    })

    addOutput(this, `${id}-CloudfrontDistributionId`, this.cf.distributionId)
  }
}
