import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { RoutingLambdaEdge } from '../constructs/RoutingLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'
import { CacheConfig } from '../../types'
import { CheckExpirationLambdaEdge } from '../constructs/CheckExpirationLambdaEdge'

export interface NextCloudfrontStackProps extends StackProps {
  nodejs?: string
  region?: string
  staticBucketName: string
  renderServerDomain: string
  renderWorkerQueueUrl: string
  buildOutputPath: string
  cacheConfig: CacheConfig
  imageTTL?: number
}

export class NextCloudfrontStack extends Stack {
  public readonly routingLambdaEdge: RoutingLambdaEdge
  public readonly checkExpLambdaEdge: CheckExpirationLambdaEdge
  public readonly cloudfront: CloudFrontDistribution

  constructor(scope: Construct, id: string, props: NextCloudfrontStackProps) {
    super(scope, id, props)
    const {
      nodejs,
      buildOutputPath,
      staticBucketName,
      renderServerDomain,
      renderWorkerQueueUrl,
      region,
      cacheConfig,
      imageTTL
    } = props

    this.routingLambdaEdge = new RoutingLambdaEdge(this, `${id}-RoutingLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      renderServerDomain,
      buildOutputPath,
      cacheConfig,
      bucketRegion: region
    })

    this.checkExpLambdaEdge = new CheckExpirationLambdaEdge(this, `${id}-CheckExpirationLambdaEdge`, {
      nodejs,
      renderWorkerQueueUrl,
      buildOutputPath,
      cacheConfig
    })

    const staticBucket = s3.Bucket.fromBucketAttributes(this, `${id}-StaticAssetsBucket`, {
      bucketName: staticBucketName,
      region
    })

    this.cloudfront = new CloudFrontDistribution(this, `${id}-NextCloudFront`, {
      staticBucket,
      renderServerDomain,
      requestEdgeFunction: this.routingLambdaEdge.lambdaEdge,
      responseEdgeFunction: this.checkExpLambdaEdge.lambdaEdge,
      cacheConfig,
      imageTTL
    })

    staticBucket.grantRead(this.routingLambdaEdge.lambdaEdge)
    staticBucket.grantRead(this.checkExpLambdaEdge.lambdaEdge)
  }
}
