import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution'
import { addOutput } from '../../utils/cdk'

export interface NextRenderServerStackProps extends cdk.StackProps {
  stage: string
  nodejs?: string
  isProduction?: boolean
}

export class NextRenderServerStack extends cdk.Stack {
  public readonly elasticbeanstalk: BeanstalkDistribution
  public readonly staticBucket: s3.Bucket
  constructor(scope: Construct, id: string, props: NextRenderServerStackProps) {
    super(scope, id, props)

    const { stage, nodejs, isProduction } = props
    const appName = `${id}-${stage}`

    this.staticBucket = new s3.Bucket(this, `${appName}-static`, {
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    })
    this.elasticbeanstalk = new BeanstalkDistribution(this, `${id}-eb`, {
      appName,
      stage,
      nodejs,
      isProduction
    })

    addOutput(this, 'StaticBucketName', this.staticBucket.bucketName)
  }
}
