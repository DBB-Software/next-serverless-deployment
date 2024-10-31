import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { RenderServerDistribution } from '../constructs/RenderServerDistribution'
import { RenderWorkerDistribution } from '../constructs/RenderWorkerDistribution'
import { addOutput } from '../../common/cdk'

export interface NextRenderServerStackProps extends cdk.StackProps {
  stage: string
  nodejs?: string
  isProduction?: boolean
  region: string
  renderServerInstanceType?: string
  renderServerMinInstances?: number
  renderServerMaxInstances?: number
}

export class NextRenderServerStack extends cdk.Stack {
  public readonly renderServer: RenderServerDistribution
  public readonly renderWorker: RenderWorkerDistribution
  public readonly staticBucket: s3.Bucket
  public readonly staticBucketName: string

  constructor(scope: Construct, id: string, props: NextRenderServerStackProps) {
    super(scope, id, props)

    const {
      stage,
      nodejs,
      isProduction,
      region,
      renderServerInstanceType,
      renderServerMinInstances,
      renderServerMaxInstances
    } = props

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

    this.renderServer = new RenderServerDistribution(this, `${id}-RenderServer`, {
      stage,
      nodejs,
      isProduction,
      staticS3Bucket: this.staticBucket,
      region,
      appName: id,
      instanceType: renderServerInstanceType,
      minInstances: renderServerMinInstances,
      maxInstances: renderServerMaxInstances
    })

    this.renderWorker = new RenderWorkerDistribution(this, `${id}-renderWorker`, {
      stage,
      nodejs,
      isProduction,
      staticS3Bucket: this.staticBucket,
      region,
      appName: id,
      instanceType: renderServerInstanceType, // TODO: separate options from server and worker
      minInstances: renderServerMinInstances,
      maxInstances: renderServerMaxInstances
    })

    addOutput(this, `${id}-StaticBucketName`, this.staticBucket.bucketName)
  }
}
