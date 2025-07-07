import { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import path from 'node:path'
import { buildLambda } from '../../common/esbuild'
import { addOutput } from '../../common/cdk'

interface OriginRequestLambdaEdgeProps extends cdk.StackProps {
  bucketName: string
  buildOutputPath: string
  nodejs?: string
}

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

export class OriginRequestLambdaEdge extends Construct {
  public readonly lambdaEdge: cloudfront.experimental.EdgeFunction

  constructor(scope: Construct, id: string, props: OriginRequestLambdaEdgeProps) {
    const { bucketName, nodejs, buildOutputPath } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']

    buildLambda('defaultLambdaMock', buildOutputPath)

    const logGroup = new logs.LogGroup(this, 'OriginRequestLambdaEdgeLogGroup', {
      logGroupName: `/aws/lambda/${id}-originRequest`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'OriginRequestLambdaEdge', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions', 'defaultLambdaMock')),
      handler: 'index.handler',
      logGroup
    })

    logGroup.grantWrite(this.lambdaEdge)

    const policyStatement = new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 's3:GetObject'],
      resources: [`${logGroup.logGroupArn}:*`, `arn:aws:s3:::${bucketName}/*`]
    })

    this.lambdaEdge.addToRolePolicy(policyStatement)

    addOutput(this, `${id}-OriginRequestLambdaEdgeName`, this.lambdaEdge.functionName)
  }
}
