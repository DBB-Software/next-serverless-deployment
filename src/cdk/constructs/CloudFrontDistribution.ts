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

export class CloudFrontDistribution extends Construct {
  public readonly cf: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: CloudFrontPropsDistribution) {
    super(scope, id)

    const { staticBucket, edgeFunction, cacheConfig } = props

    const splitCachePolicy = new cloudfront.CachePolicy(this, 'SplitCachePolicy', {
      cachePolicyName: `${id}-S3CachePolicy`,
      queryStringBehavior: cacheConfig.cacheQueries?.length
        ? cloudfront.CacheQueryStringBehavior.allowList(...cacheConfig.cacheQueries)
        : cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cacheConfig.cacheCookies?.length
        ? cloudfront.CacheCookieBehavior.allowList(...cacheConfig.cacheCookies)
        : cloudfront.CacheCookieBehavior.none(),
      defaultTtl: Duration.days(1) // 1 day (default)
    })

    const longCachePolicy = new cloudfront.CachePolicy(this, 'LongCachePolicy', {
      cachePolicyName: `${id}-LongCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      defaultTtl: Duration.days(30), // 1 month
      maxTtl: Duration.days(30), // 1 month
      minTtl: Duration.days(30) // 1 month
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
