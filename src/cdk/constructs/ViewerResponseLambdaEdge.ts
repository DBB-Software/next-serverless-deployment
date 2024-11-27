import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import path from 'node:path'
import { buildLambda } from '../../build/edge'

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

interface ViewerResponseLambdaEdgeProps {
  nodejs?: string
  buildOutputPath: string
}

export class ViewerResponseLambdaEdge extends Construct {
  public readonly lambdaEdge: cloudfront.experimental.EdgeFunction

  constructor(scope: Construct, id: string, props: ViewerResponseLambdaEdgeProps) {
    const { nodejs, buildOutputPath } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']
    const name = 'viewerResponse'

    buildLambda(name, buildOutputPath)

    this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'ViewerResponseLambdaEdge', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions', name)),
      handler: 'index.handler'
    })
  }
}
