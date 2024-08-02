import { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import path from 'node:path'

interface CheckExpirationLambdaEdgeProps extends cdk.StackProps {
  bucketName: string
  buildOutputPath: string
  nodejs?: string
}

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

export class CheckExpirationLambdaEdge extends Construct {
  public readonly lambdaEdge: cloudfront.experimental.EdgeFunction

  constructor(scope: Construct, id: string, props: CheckExpirationLambdaEdgeProps) {
    const { nodejs, buildOutputPath, bucketName } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']

    const logGroup = new logs.LogGroup(this, 'CheckExpirationLambdaEdgeLogGroup', {
      logGroupName: `/aws/lambda/${id}-checkExpiration`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'CheckExpirationLambdaEdge', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions')),
      handler: 'checkExpiration.handler',
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
