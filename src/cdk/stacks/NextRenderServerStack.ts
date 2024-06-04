import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution'
import { addOutput } from '../../common/cdk'

export interface NextRenderServerStackProps extends cdk.StackProps {
  stage: string
  nodejs?: string
  isProduction?: boolean
  version: string
}

export class NextRenderServerStack extends cdk.Stack {
  public readonly elasticbeanstalk: BeanstalkDistribution
  public readonly staticBucket: s3.Bucket
  constructor(scope: Construct, id: string, props: NextRenderServerStackProps) {
    super(scope, id, props)

    const { stage, nodejs, isProduction, version } = props

    this.staticBucket = new s3.Bucket(this, `${id}-static`, {
      bucketName: `${id}-${version}-static`,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false
      }
    })

    this.elasticbeanstalk = new BeanstalkDistribution(this, 'ElasticBeanstalkDistribution', {
      stage,
      nodejs,
      isProduction
    })

    addOutput(this, 'StaticBucketName', this.staticBucket.bucketName)
  }
}
