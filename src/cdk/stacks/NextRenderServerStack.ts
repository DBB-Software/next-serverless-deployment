import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution'
import { addOutput } from '../../common/cdk'

export interface NextRenderServerStackProps extends cdk.StackProps {
  stage: string
  nodejs?: string
  isProduction?: boolean
  region: string
}

export class NextRenderServerStack extends cdk.Stack {
  public readonly elasticbeanstalk: BeanstalkDistribution
  public readonly staticBucket: s3.Bucket
  public readonly staticBucketName: string

  constructor(scope: Construct, id: string, props: NextRenderServerStackProps) {
    super(scope, id, props)

    const { stage, nodejs, isProduction, region } = props

    this.staticBucketName = `${id}-static`
    this.staticBucket = new s3.Bucket(this, this.staticBucketName, {
      bucketName: this.staticBucketName,
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

    this.elasticbeanstalk = new BeanstalkDistribution(this, `${id}-ElasticBeanstalkDistribution`, {
      stage,
      nodejs,
      isProduction,
      staticS3Bucket: this.staticBucket,
      region,
      appName: id
    })

    addOutput(this, `${id}-StaticBucketName`, this.staticBucket.bucketName)
  }
}
