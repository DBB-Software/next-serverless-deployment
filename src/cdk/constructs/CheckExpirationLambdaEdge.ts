import { Construct } from 'constructs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as logs from 'aws-cdk-lib/aws-logs'
import path from 'node:path'
import { buildLambda } from '../../build/edge'
import { CacheConfig } from '../../types'

interface CheckExpirationLambdaEdgeProps extends cdk.StackProps {
  renderWorkerQueueUrl: string
  renderWorkerQueueArn: string
  buildOutputPath: string
  nodejs?: string
  cacheConfig: CacheConfig
  region: string
}

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

export class CheckExpirationLambdaEdge extends Construct {
  public readonly lambdaEdge: cloudfront.experimental.EdgeFunction

  constructor(scope: Construct, id: string, props: CheckExpirationLambdaEdgeProps) {
    const { nodejs, buildOutputPath, cacheConfig, renderWorkerQueueUrl, renderWorkerQueueArn, region } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']
    const name = 'checkExpiration'

    buildLambda(name, buildOutputPath, {
      define: {
        'process.env.RENDER_QUEUE_URL': JSON.stringify(renderWorkerQueueUrl),
        'process.env.CACHE_CONFIG': JSON.stringify(cacheConfig),
        'process.env.QUEUE_REGION': JSON.stringify(region)
      }
    })

    const logGroup = new logs.LogGroup(this, 'CheckExpirationLambdaEdgeLogGroup', {
      logGroupName: `/aws/lambda/${id}-checkExpiration`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'CheckExpirationLambdaEdge', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions', name)),
      handler: 'index.handler',
      logGroup
    })

    this.lambdaEdge.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [renderWorkerQueueArn]
      })
    )

    logGroup.grantWrite(this.lambdaEdge)
  }
}
