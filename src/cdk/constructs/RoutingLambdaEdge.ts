import { Construct } from 'constructs'
import { type StackProps } from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import path from 'node:path'
import { buildLambda } from '../../build/edge'

interface RoutingLambdaEdgeProps extends StackProps {
  bucketName: string
  ebAppUrl: string
  buildOutputPath: string
  nodejs?: string
}

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

export class RoutingLambdaEdge extends Construct {
  public readonly lambdaEdge: cloudfront.experimental.EdgeFunction

  constructor(scope: Construct, id: string, props: RoutingLambdaEdgeProps) {
    const { bucketName, ebAppUrl, nodejs, buildOutputPath } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['18']

    buildLambda('edgeRouting', buildOutputPath, {
      define: {
        'process.env.S3_BUCKET': JSON.stringify(bucketName),
        'process.env.EB_APP_URL': JSON.stringify(ebAppUrl)
      }
    })

    this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'RoutingLambdaEdge', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions')),
      handler: 'edgeRouting.handler'
    })
  }
}
