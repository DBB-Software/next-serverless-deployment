import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { OriginRequestLambdaEdge } from '../constructs/OriginRequestLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'
import { ViewerResponseLambdaEdge } from '../constructs/ViewerResponseLambdaEdge'
import { ViewerRequestLambdaEdge } from '../constructs/ViewerRequestLambdaEdge'
import { RevalidateLambda } from '../constructs/RevalidateLambda'
import { SecretManagerDistribution } from '../constructs/SecretManagerDistribution'
import { DeployConfig, NextRedirects, NextI18nConfig, NextRewrites } from '../../types'
import * as iam from 'aws-cdk-lib/aws-iam'

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
  sqsQueueUrl: string
  sqsQueueArn: string
}

export class NextCloudfrontStack extends Stack {
  public readonly originRequestLambdaEdge: OriginRequestLambdaEdge
  public readonly viewerResponseLambdaEdge: ViewerResponseLambdaEdge
  public readonly viewerRequestLambdaEdge: ViewerRequestLambdaEdge
  public readonly cloudfront: CloudFrontDistribution
  public readonly revalidateLambda: RevalidateLambda
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
      isTrailingSlashEnabled,
      sqsQueueUrl,
      sqsQueueArn
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

    this.revalidateLambda = new RevalidateLambda(this, `${id}-RevalidateLambda`, {
      nodejs,
      buildOutputPath,
      sqsRegion: region,
      sqsQueueUrl
    })

    const staticBucket = s3.Bucket.fromBucketAttributes(this, `${id}-StaticAssetsBucket`, {
      bucketName: staticBucketName,
      region
    })

    const secretManager = new SecretManagerDistribution(this, `${id}-SecretManagerDistribution`)

    secretManager.xApiKey.grantRead(this.revalidateLambda.lambda)

    this.revalidateLambda.lambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [sqsQueueArn]
      })
    )

    this.cloudfront = new CloudFrontDistribution(this, `${id}-NextCloudFront`, {
      staticBucket,
      renderServerDomain,
      requestEdgeFunction: this.originRequestLambdaEdge.lambdaEdge,
      viewerResponseEdgeFunction: this.viewerResponseLambdaEdge.lambdaEdge,
      viewerRequestLambdaEdge: this.viewerRequestLambdaEdge.lambdaEdge,
      revalidateLambdaUrl: this.revalidateLambda.lambdaHttpUrl,
      deployConfig: deployConfig,
      imageTTL
    })

    staticBucket.grantRead(this.originRequestLambdaEdge.lambdaEdge)
  }
}
