import { Construct } from 'constructs'
import { Duration } from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { addOutput } from '../../common/cdk'
import { DeployConfig } from '../../types'
import { HEADER_DEVICE_TYPE } from '../../constants'

interface CloudFrontPropsDistribution {
  staticBucket: s3.IBucket
  renderServerDomain: string
  requestEdgeFunction: cloudfront.experimental.EdgeFunction
  viewerResponseEdgeFunction: cloudfront.experimental.EdgeFunction
  viewerRequestLambdaEdge: cloudfront.experimental.EdgeFunction
  revalidateLambdaUrl: lambda.FunctionUrl
  deployConfig: DeployConfig
  imageTTL?: number
}

const OneDayCache = Duration.days(1)
const OneMonthCache = Duration.days(30)
const NoCache = Duration.seconds(0)

const defaultNextQueries = ['_rsc']
const defaultNextHeaders = ['Next-Router-State-Tree', 'Next-Url', 'Rsc', 'Next-Router-Prefetch']
const imageQueries = ['w', 'h', 'url', 'q']
export class CloudFrontDistribution extends Construct {
  public readonly cf: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: CloudFrontPropsDistribution) {
    super(scope, id)

    const {
      staticBucket,
      requestEdgeFunction,
      viewerResponseEdgeFunction,
      viewerRequestLambdaEdge,
      revalidateLambdaUrl,
      deployConfig,
      renderServerDomain,
      imageTTL
    } = props

    const splitCachePolicy = new cloudfront.CachePolicy(this, 'SplitCachePolicy', {
      cachePolicyName: `${id}-SplitCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(
        ...defaultNextQueries.concat(deployConfig.cache.cacheQueries ?? [])
      ),
      cookieBehavior: deployConfig.cache.cacheCookies?.length
        ? cloudfront.CacheCookieBehavior.allowList(...deployConfig.cache.cacheCookies)
        : cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        ...defaultNextHeaders,
        ...Object.values(HEADER_DEVICE_TYPE)
      ),
      minTtl: NoCache,
      defaultTtl: NoCache, // no caching by default, cache value is going to be used from Cache-Control header.
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true
    })

    const longCachePolicy = new cloudfront.CachePolicy(this, 'LongCachePolicy', {
      cachePolicyName: `${id}-LongCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      defaultTtl: OneMonthCache,
      maxTtl: OneMonthCache,
      minTtl: OneMonthCache,
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true
    })

    const imageTTLValue = imageTTL ? Duration.seconds(imageTTL) : OneDayCache

    const imageCachePolicy = new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
      cachePolicyName: `${id}-ImageCachePolicy`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(...imageQueries),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(...defaultNextHeaders),
      defaultTtl: imageTTLValue,
      maxTtl: imageTTLValue,
      minTtl: imageTTLValue,
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true
    })

    const publicAssetsCachePolicy = new cloudfront.CachePolicy(this, 'PublicAssetsCachePolicy', {
      cachePolicyName: `${id}-PublicAssetsCachePolicy`,
      defaultTtl: deployConfig.publicAssets?.ttl ? Duration.seconds(deployConfig.publicAssets.ttl) : NoCache,
      maxTtl: deployConfig.publicAssets?.ttl ? Duration.seconds(deployConfig.publicAssets.ttl) : NoCache,
      minTtl: deployConfig.publicAssets?.ttl ? Duration.seconds(deployConfig.publicAssets.ttl) : NoCache,
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true
    })

    const s3Origin = new origins.S3Origin(staticBucket)
    const publicFolderS3Origin = new origins.S3Origin(staticBucket, {
      originPath: '/public'
    })
    const nextServerOrigin = new origins.HttpOrigin(renderServerDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80
    })

    const revalidateLambdaOrigin = new origins.FunctionUrlOrigin(revalidateLambdaUrl)

    this.cf = new cloudfront.Distribution(this, id, {
      defaultBehavior: {
        origin: s3Origin,
        edgeLambdas: [
          {
            functionVersion: requestEdgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST
          },
          {
            functionVersion: viewerResponseEdgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_RESPONSE
          },
          {
            functionVersion: viewerRequestLambdaEdge.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST
          }
        ],
        cachePolicy: splitCachePolicy,
        compress: true
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
          cachePolicy: splitCachePolicy,
          compress: true
        },
        '/_next/revalidate': {
          origin: revalidateLambdaOrigin,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
        },
        '/_next/image*': {
          origin: nextServerOrigin,
          cachePolicy: imageCachePolicy
        },
        '/_next/*': {
          origin: s3Origin,
          cachePolicy: longCachePolicy,
          compress: true
        },
        ...(deployConfig.publicAssets
          ? {
              [`${deployConfig.publicAssets.prefix}/*`]: {
                origin: publicFolderS3Origin,
                cachePolicy: publicAssetsCachePolicy
              }
            }
          : {})
      }
    })

    addOutput(this, `${id}-CloudfrontDistributionId`, this.cf.distributionId)
  }
}
