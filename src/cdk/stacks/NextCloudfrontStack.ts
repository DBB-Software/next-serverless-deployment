import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { OriginRequestLambdaEdge } from '../constructs/OriginRequestLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'
import { CacheConfig } from '../../types'
import { OriginResponseLambdaEdge } from '../constructs/OriginResponseLambdaEdge'
import { ViewerResponseLambdaEdge } from '../constructs/ViewerResponseLambdaEdge'

export interface NextCloudfrontStackProps extends StackProps {
  nodejs?: string
  region: string
  staticBucketName: string
  renderServerDomain: string
  renderWorkerQueueUrl: string
  renderWorkerQueueArn: string
  buildOutputPath: string
  cacheConfig: CacheConfig
  imageTTL?: number
}

export class NextCloudfrontStack extends Stack {
  public readonly originRequestLambdaEdge: OriginRequestLambdaEdge
  public readonly originResponseLambdaEdge: OriginResponseLambdaEdge
  public readonly viewerResponseLambdaEdge: ViewerResponseLambdaEdge
  public readonly cloudfront: CloudFrontDistribution

  constructor(scope: Construct, id: string, props: NextCloudfrontStackProps) {
    super(scope, id, props)
    const {
      nodejs,
      buildOutputPath,
      staticBucketName,
      renderServerDomain,
      renderWorkerQueueUrl,
      renderWorkerQueueArn,
      region,
      cacheConfig,
      imageTTL
    } = props

    this.originRequestLambdaEdge = new OriginRequestLambdaEdge(this, `${id}-OriginRequestLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      renderServerDomain,
      buildOutputPath,
      cacheConfig,
      bucketRegion: region
    })

    this.originResponseLambdaEdge = new OriginResponseLambdaEdge(this, `${id}-OriginResponseLambdaEdge`, {
      nodejs,
      renderWorkerQueueUrl,
      buildOutputPath,
      cacheConfig,
      renderWorkerQueueArn,
      region
    })

    this.viewerResponseLambdaEdge = new ViewerResponseLambdaEdge(this, `${id}-ViewerResponseLambdaEdge`, {
      nodejs,
      buildOutputPath
    })

    const staticBucket = s3.Bucket.fromBucketAttributes(this, `${id}-StaticAssetsBucket`, {
      bucketName: staticBucketName,
      region
    })

    this.cloudfront = new CloudFrontDistribution(this, `${id}-NextCloudFront`, {
      staticBucket,
      renderServerDomain,
      requestEdgeFunction: this.originRequestLambdaEdge.lambdaEdge,
      responseEdgeFunction: this.originResponseLambdaEdge.lambdaEdge,
      viewerResponseEdgeFunction: this.viewerResponseLambdaEdge.lambdaEdge,
      cacheConfig,
      imageTTL
    })

    staticBucket.grantRead(this.originRequestLambdaEdge.lambdaEdge)
    staticBucket.grantRead(this.originResponseLambdaEdge.lambdaEdge)
  }
}
