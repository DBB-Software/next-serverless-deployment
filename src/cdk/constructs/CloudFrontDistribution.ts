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
  requestEdgeFunction: cloudfront.experimental.EdgeFunction
  responseEdgeFunction: cloudfront.experimental.EdgeFunction
  cacheConfig: CacheConfig
  imageTTL?: number
}

const OneDayCache = Duration.days(1)
const OneMonthCache = Duration.days(30)
const NoCache = Duration.seconds(0)

const defaultNextQueries = ['_rsc']
const defaultNextHeaders = ['Cache-Control']
const imageQueries = ['w', 'h', 'url', 'q']
export class CloudFrontDistribution extends Construct {
  public readonly cf: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: CloudFrontPropsDistribution) {
    super(scope, id)

    const { staticBucket, requestEdgeFunction, responseEdgeFunction, cacheConfig, ebAppDomain, imageTTL } = props

    const splitCachePolicy = new cloudfront.CachePolicy(this, 'SplitCachePolicy', {
      cachePolicyName: `${id}-SplitCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(
        ...defaultNextQueries.concat(cacheConfig.cacheQueries ?? [])
      ),
      cookieBehavior: cacheConfig.cacheCookies?.length
        ? cloudfront.CacheCookieBehavior.allowList(...cacheConfig.cacheCookies)
        : cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        ...defaultNextHeaders,
        ...Object.values(HEADER_DEVICE_TYPE)
      ),
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

    const imageTTLValue = imageTTL ? Duration.seconds(imageTTL) : OneDayCache

    const imageCachePolicy = new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
      cachePolicyName: `${id}-ImageCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(...imageQueries),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(...defaultNextHeaders),
      defaultTtl: imageTTLValue,
      maxTtl: imageTTLValue,
      minTtl: imageTTLValue
    })

    const s3Origin = new origins.S3Origin(staticBucket)
    const nextServerOrigin = new origins.HttpOrigin(ebAppDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80
    })

    this.cf = new cloudfront.Distribution(this, id, {
      defaultBehavior: {
        origin: s3Origin,
        edgeLambdas: [
          {
            functionVersion: requestEdgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST
          },
          {
            functionVersion: responseEdgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE
          }
        ],
        cachePolicy: splitCachePolicy
      },
      defaultRootObject: '',
      additionalBehaviors: {
        ['/_next/data/*']: {
          origin: s3Origin,
          edgeLambdas: [
            {
              functionVersion: requestEdgeFunction.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST
            }
          ],
          cachePolicy: splitCachePolicy
        },
        '/_next/image*': {
          origin: nextServerOrigin,
          cachePolicy: imageCachePolicy
        },
        '/_next/*': {
          origin: s3Origin,
          cachePolicy: longCachePolicy
        }
      }
    })

    addOutput(this, `${id}-CloudfrontDistributionId`, this.cf.distributionId)
  }
}
