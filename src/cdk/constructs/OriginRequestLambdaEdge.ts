import { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import path from 'node:path'
import { buildLambda } from '../../build/edge'
import { CacheConfig } from '../../types'

interface OriginRequestLambdaEdgeProps extends cdk.StackProps {
  bucketName: string
  renderServerDomain: string
  buildOutputPath: string
  nodejs?: string
  cacheConfig: CacheConfig
  bucketRegion?: string
}

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

export class OriginRequestLambdaEdge extends Construct {
  public readonly lambdaEdge: cloudfront.experimental.EdgeFunction

  constructor(scope: Construct, id: string, props: OriginRequestLambdaEdgeProps) {
    const { bucketName, bucketRegion, renderServerDomain, nodejs, buildOutputPath, cacheConfig } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']
    const name = 'originRequest'

    buildLambda(name, buildOutputPath, {
      define: {
        'process.env.S3_BUCKET': JSON.stringify(bucketName),
        'process.env.S3_BUCKET_REGION': JSON.stringify(bucketRegion ?? ''),
        'process.env.EB_APP_URL': JSON.stringify(renderServerDomain),
        'process.env.CACHE_CONFIG': JSON.stringify(cacheConfig)
      }
    })

    const logGroup = new logs.LogGroup(this, 'OriginRequestLambdaEdgeLogGroup', {
      logGroupName: `/aws/lambda/${id}-originRequest`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'OriginRequestLambdaEdge', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions', name)),
      handler: 'index.handler',
      logGroup
    })

    logGroup.grantWrite(this.lambdaEdge)

    const policyStatement = new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 's3:GetObject'],
      resources: [`${logGroup.logGroupArn}:*`, `arn:aws:s3:::${bucketName}/*`]
    })

    this.lambdaEdge.addToRolePolicy(policyStatement)
  }
}
