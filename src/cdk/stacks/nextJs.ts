import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution'
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution'

interface NextjsProps {
  stage: string
  nodejs?: string
}

export class Nextjs extends Stack {
  public readonly elasticbeanstalk: BeanstalkDistribution
  public readonly cloudfront: CloudFrontDistribution
  public readonly staticBucket: s3.Bucket
  public readonly staticBucketName: string

  constructor(scope: Construct, id: string, props: NextjsProps) {
    super(scope, id)

    const { stage, nodejs } = props
    const appName = `${id}-${stage}`
    this.staticBucketName = `${appName}-static`

    this.staticBucket = new s3.Bucket(this, this.staticBucketName, {
      removalPolicy: stage === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      bucketName: this.staticBucketName,
      publicReadAccess: true
    })
    this.elasticbeanstalk = new BeanstalkDistribution(this, `${id}ElasticBeanstalk`, { appName, stage, nodejs })
    this.cloudfront = new CloudFrontDistribution(this, `${id}CloudFront`, {
      staticBucket: this.staticBucket,
      ebEnv: this.elasticbeanstalk.ebEnv
    })
  }
}
