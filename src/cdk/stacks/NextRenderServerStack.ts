import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution'

interface NextRenderServerStackProps extends StackProps {
  stage: string
  nodejs?: string
  isProduction?: boolean
}

export class NextRenderServerStack extends Stack {
  public readonly elasticbeanstalk: BeanstalkDistribution
  public readonly staticBucket: s3.Bucket
  public readonly staticBucketName: string

  constructor(scope: Construct, id: string, props: NextRenderServerStackProps) {
    super(scope, id, props)

    const { stage, nodejs, isProduction } = props
    const appName = `${id}-${stage}`
    this.staticBucketName = `${appName}-static`

    this.staticBucket = new s3.Bucket(this, this.staticBucketName, {
      removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      bucketName: this.staticBucketName
    })
    this.elasticbeanstalk = new BeanstalkDistribution(this, `${id}-eb`, {
      appName,
      stage,
      nodejs,
      isProduction
    })
  }
}
