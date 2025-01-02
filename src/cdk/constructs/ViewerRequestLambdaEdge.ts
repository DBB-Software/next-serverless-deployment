import { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import path from 'node:path'
import { buildLambda } from '../../common/esbuild'
import { NextRedirects, DeployConfig } from '../../types'

interface ViewerRequestLambdaEdgeProps extends cdk.StackProps {
  buildOutputPath: string
  nodejs?: string
  redirects?: NextRedirects
  internationalizationConfig?: DeployConfig['internationalization']
  trailingSlash?: boolean
}

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

export class ViewerRequestLambdaEdge extends Construct {
  public readonly lambdaEdge: cloudfront.experimental.EdgeFunction

  constructor(scope: Construct, id: string, props: ViewerRequestLambdaEdgeProps) {
    const { nodejs, buildOutputPath, redirects, internationalizationConfig, trailingSlash = false } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']
    const name = 'viewerRequest'

    buildLambda(name, buildOutputPath, {
      define: {
        'process.env.REDIRECTS': JSON.stringify(redirects ?? []),
        'process.env.LOCALES_CONFIG': JSON.stringify(internationalizationConfig ?? null),
        'process.env.IS_TRAILING_SLASH': JSON.stringify(trailingSlash)
      }
    })

    const logGroup = new logs.LogGroup(this, 'ViewerRequestLambdaEdgeLogGroup', {
      logGroupName: `/aws/lambda/${id}-viewerRequest`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'ViewerRequestLambdaEdge', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions', name)),
      handler: 'index.handler',
      logGroup
    })

    logGroup.grantWrite(this.lambdaEdge)

    const policyStatement = new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`${logGroup.logGroupArn}:*`]
    })

    this.lambdaEdge.addToRolePolicy(policyStatement)
  }
}
