import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { RoutingLambdaEdge } from '../constructs/RoutingLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'
import { CacheConfig } from '../../types'
import { CheckExpirationLambdaEdge } from '../constructs/CheckExpirationLambdaEdge'
import { buildLambda } from '../../build/edge'

export interface NextCloudfrontStackProps extends StackProps {
  nodejs?: string
  region?: string
  staticBucketName: string
  ebAppDomain: string
  buildOutputPath: string
  cacheConfig: CacheConfig
}

export class NextCloudfrontStack extends Stack {
  public readonly routingLambdaEdge: RoutingLambdaEdge
  public readonly checkExpLambdaEdge: CheckExpirationLambdaEdge
  public readonly cloudfront: CloudFrontDistribution

  constructor(scope: Construct, id: string, props: NextCloudfrontStackProps) {
    super(scope, id, props)
    const { nodejs, buildOutputPath, staticBucketName, ebAppDomain, region, cacheConfig } = props

    buildLambda(['edgeRouting', 'checkExpiration'], buildOutputPath, {
      define: {
        'process.env.S3_BUCKET': JSON.stringify(staticBucketName),
        'process.env.S3_BUCKET_REGION': JSON.stringify(staticBucketName ?? ''),
        'process.env.EB_APP_URL': JSON.stringify(ebAppDomain),
        'process.env.CACHE_CONFIG': JSON.stringify(cacheConfig)
      }
    })

    this.routingLambdaEdge = new RoutingLambdaEdge(this, `${id}-RoutingLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      ebAppDomain,
      buildOutputPath,
      cacheConfig,
      bucketRegion: region
    })

    this.checkExpLambdaEdge = new CheckExpirationLambdaEdge(this, `${id}-CheckExpirationLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      buildOutputPath
    })

    const staticBucket = s3.Bucket.fromBucketAttributes(this, `${id}-StaticAssetsBucket`, {
      bucketName: staticBucketName,
      region
    })

    this.cloudfront = new CloudFrontDistribution(this, `${id}-NextCloudFront`, {
      staticBucket,
      ebAppDomain,
      responseEdgeFunction: this.checkExpLambdaEdge.lambdaEdge,
      requestEdgeFunction: this.routingLambdaEdge.lambdaEdge,
      cacheConfig
    })

    staticBucket.grantRead(this.routingLambdaEdge.lambdaEdge)
    staticBucket.grantRead(this.checkExpLambdaEdge.lambdaEdge)
  }
}
