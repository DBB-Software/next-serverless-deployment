import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { OriginRequestLambdaEdge } from '../constructs/OriginRequestLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'
import { OriginResponseLambdaEdge } from '../constructs/OriginResponseLambdaEdge'
import { ViewerResponseLambdaEdge } from '../constructs/ViewerResponseLambdaEdge'
import { ViewerRequestLambdaEdge } from '../constructs/ViewerRequestLambdaEdge'
import { DeployConfig, NextRedirects } from '../../types'

export interface NextCloudfrontStackProps extends StackProps {
  nodejs?: string
  region: string
  staticBucketName: string
  renderServerDomain: string
  renderWorkerQueueUrl: string
  renderWorkerQueueArn: string
  buildOutputPath: string
  deployConfig: DeployConfig
  imageTTL?: number
  redirects?: NextRedirects
  trailingSlash?: boolean
  nextCachedRoutesMatchers: string[]
}

export class NextCloudfrontStack extends Stack {
  public readonly originRequestLambdaEdge: OriginRequestLambdaEdge
  public readonly originResponseLambdaEdge: OriginResponseLambdaEdge
  public readonly viewerResponseLambdaEdge: ViewerResponseLambdaEdge
  public readonly viewerRequestLambdaEdge: ViewerRequestLambdaEdge
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
      deployConfig,
      imageTTL,
      redirects,
      trailingSlash = false,
      nextCachedRoutesMatchers
    } = props

    this.originRequestLambdaEdge = new OriginRequestLambdaEdge(this, `${id}-OriginRequestLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      renderServerDomain,
      buildOutputPath,
      cacheConfig: deployConfig.cache,
      bucketRegion: region,
      nextCachedRoutesMatchers
    })

    this.originResponseLambdaEdge = new OriginResponseLambdaEdge(this, `${id}-OriginResponseLambdaEdge`, {
      nodejs,
      renderWorkerQueueUrl,
      buildOutputPath,
      cacheConfig: deployConfig.cache,
      renderWorkerQueueArn,
      region
    })

    this.viewerRequestLambdaEdge = new ViewerRequestLambdaEdge(this, `${id}-ViewerRequestLambdaEdge`, {
      buildOutputPath,
      nodejs,
      redirects,
      internationalizationConfig: deployConfig.internationalization,
      trailingSlash
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
      viewerRequestLambdaEdge: this.viewerRequestLambdaEdge.lambdaEdge,
      cacheConfig: deployConfig.cache,
      imageTTL
    })

    staticBucket.grantRead(this.originRequestLambdaEdge.lambdaEdge)
    staticBucket.grantRead(this.originResponseLambdaEdge.lambdaEdge)
  }
}
