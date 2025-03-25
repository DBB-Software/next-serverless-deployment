import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import { RenderServerDistribution } from '../constructs/RenderServerDistribution'
import { RenderWorkerDistribution } from '../constructs/RenderWorkerDistribution'
import { DynamoDBDistribution } from '../constructs/DynamoDBDistribution'
import { addOutput } from '../../common/cdk'
import path from 'path'

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
  public readonly dynamoDB: DynamoDBDistribution
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

    this.dynamoDB = new DynamoDBDistribution(this, `${id}-DynamoDBCacheTable`, {
      stage,
      appName: id,
      isProduction
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
      maxInstances: renderServerMaxInstances,
      dynamoDBCacheTable: this.dynamoDB.table.tableName
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
      maxInstances: renderServerMaxInstances,
      dynamoDBCacheTable: this.dynamoDB.table.tableName
    })

    this.renderServer.ebInstanceProfileRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
          'dynamodb:DeleteItem',
          'dynamodb:GetItem',
          'dynamodb:GetRecords',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:Scan',
          'dynamodb:Query'
        ],
        resources: [this.dynamoDB.table.tableArn, path.join(this.dynamoDB.table.tableArn, '/index/cacheKey-index')],
        effect: iam.Effect.ALLOW
      })
    )

    this.renderWorker.instanceRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
          'dynamodb:DeleteItem',
          'dynamodb:GetItem',
          'dynamodb:GetRecords',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:Scan',
          'dynamodb:Query'
        ],
        resources: [this.dynamoDB.table.tableArn, path.join(this.dynamoDB.table.tableArn, '/index/cacheKey-index')],
        effect: iam.Effect.ALLOW
      })
    )

    this.renderWorker.instanceRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: ['*'],
        effect: iam.Effect.ALLOW
      })
    )

    addOutput(this, `${id}-StaticBucketName`, this.staticBucket.bucketName)
    addOutput(this, `${id}-DynamoDBTableName`, this.dynamoDB.table.tableName)
  }
}
