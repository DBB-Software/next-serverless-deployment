import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { RoutingLambdaEdge } from '../constructs/RoutingLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'
import { CacheConfig } from '../../types'

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
  public readonly cloudfront: CloudFrontDistribution

  constructor(scope: Construct, id: string, props: NextCloudfrontStackProps) {
    super(scope, id, props)
    const { nodejs, buildOutputPath, staticBucketName, ebAppDomain, region, cacheConfig } = props

    this.routingLambdaEdge = new RoutingLambdaEdge(this, `${id}-RoutingLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      ebAppDomain,
      buildOutputPath,
      cacheConfig,
      bucketRegion: region
    })

    const staticBucket = s3.Bucket.fromBucketAttributes(this, `${id}-StaticAssetsBucket`, {
      bucketName: staticBucketName,
      region
    })

    this.cloudfront = new CloudFrontDistribution(this, `${id}-NextCloudFront`, {
      staticBucket,
      ebAppDomain,
      edgeFunction: this.routingLambdaEdge.lambdaEdge,
      cacheConfig
    })

    staticBucket.grantRead(this.routingLambdaEdge.lambdaEdge)
  }
}
