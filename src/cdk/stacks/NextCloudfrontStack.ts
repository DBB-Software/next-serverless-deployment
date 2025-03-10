import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { OriginRequestLambdaEdge } from '../constructs/OriginRequestLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'
import { ViewerResponseLambdaEdge } from '../constructs/ViewerResponseLambdaEdge'
import { ViewerRequestLambdaEdge } from '../constructs/ViewerRequestLambdaEdge'
import { DeployConfig, NextRedirects, NextI18nConfig, NextRewrites } from '../../types'

export interface NextCloudfrontStackProps extends StackProps {
  nodejs?: string
  region: string
  staticBucketName: string
  renderServerDomain: string
  buildOutputPath: string
  deployConfig: DeployConfig
  imageTTL?: number
  redirectsConfig?: NextRedirects
  nextI18nConfig?: NextI18nConfig
  cachedRoutesMatchers: string[]
  rewritesConfig: NextRewrites
  isTrailingSlashEnabled: boolean
}

export class NextCloudfrontStack extends Stack {
  public readonly originRequestLambdaEdge: OriginRequestLambdaEdge
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
      region,
      deployConfig,
      imageTTL,
      redirectsConfig,
      cachedRoutesMatchers,
      nextI18nConfig,
      rewritesConfig,
      isTrailingSlashEnabled
    } = props

    this.originRequestLambdaEdge = new OriginRequestLambdaEdge(this, `${id}-OriginRequestLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      renderServerDomain,
      buildOutputPath,
      cacheConfig: deployConfig.cache,
      bucketRegion: region,
      cachedRoutesMatchers
    })

    this.viewerRequestLambdaEdge = new ViewerRequestLambdaEdge(this, `${id}-ViewerRequestLambdaEdge`, {
      buildOutputPath,
      nodejs,
      redirectsConfig,
      rewritesConfig,
      nextI18nConfig,
      isTrailingSlashEnabled
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
      viewerResponseEdgeFunction: this.viewerResponseLambdaEdge.lambdaEdge,
      viewerRequestLambdaEdge: this.viewerRequestLambdaEdge.lambdaEdge,
      deployConfig: deployConfig,
      imageTTL
    })

    staticBucket.grantRead(this.originRequestLambdaEdge.lambdaEdge)
  }
}
