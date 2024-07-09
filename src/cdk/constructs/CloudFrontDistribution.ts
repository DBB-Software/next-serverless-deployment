import { Construct } from 'constructs'
import { Duration } from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { addOutput } from '../../common/cdk'
import { CacheConfig } from '../../types'

interface CloudFrontPropsDistribution {
  staticBucket: s3.IBucket
  ebAppDomain: string
  edgeFunction: cloudfront.experimental.EdgeFunction
  cacheConfig: CacheConfig
}

const OneDayCache = Duration.days(1)
const OneMonthCache = Duration.days(30)

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
      defaultTtl: OneDayCache // 1 day (default)
    })

    const longCachePolicy = new cloudfront.CachePolicy(this, 'LongCachePolicy', {
      cachePolicyName: `${id}-LongCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      defaultTtl: OneMonthCache, // 1 month
      maxTtl: OneMonthCache, // 1 month
      minTtl: OneMonthCache // 1 month
    })

    this.cf = new cloudfront.Distribution(this, id, {
      defaultBehavior: {
        origin: new origins.S3Origin(staticBucket),
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
          origin: new origins.S3Origin(staticBucket),
          cachePolicy: longCachePolicy
        }
      }
    })

    addOutput(this, `${id}-CloudfrontDistributionId`, this.cf.distributionId)
  }
}
