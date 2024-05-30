import { Stack, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk'
import { RoutingLambdaEdge } from '../constructs/RoutingLambdaEdge'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'

interface NextCloudfrontStackProps extends StackProps {
  nodejs?: string
  staticBucketName: string
  staticBucket: s3.Bucket
  ebAppUrl: string
  ebEnv: elasticbeanstalk.CfnEnvironment
  buildOutputPath: string
}

export class NextCloudfrontStack extends Stack {
  public readonly routingLambdaEdge: RoutingLambdaEdge
  public readonly cloudfront: CloudFrontDistribution

  constructor(scope: Construct, id: string, props: NextCloudfrontStackProps) {
    super(scope, id, props)
    const { nodejs, buildOutputPath, staticBucketName, staticBucket, ebAppUrl, ebEnv } = props

    this.routingLambdaEdge = new RoutingLambdaEdge(this, `${id}RoutingLambdaEdge`, {
      nodejs,
      bucketName: staticBucketName,
      ebAppUrl: ebAppUrl,
      buildOutputPath
    })

    this.cloudfront = new CloudFrontDistribution(this, `${id}CloudFront`, {
      staticBucket: staticBucket,
      ebEnv: ebEnv,
      edgeFunction: this.routingLambdaEdge.lambdaEdge
    })

    staticBucket.grantRead(this.routingLambdaEdge.lambdaEdge)
  }
}
