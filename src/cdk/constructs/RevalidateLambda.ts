import { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import { buildLambda } from '../../common/esbuild'
import path from 'node:path'
import { addOutput } from '../../common/cdk'

interface RevalidateLambdaProps extends cdk.StackProps {
  buildOutputPath: string
  nodejs?: string
  sqsRegion: string
  sqsQueueUrl: string
}

const NodeJSEnvironmentMapping: Record<string, lambda.Runtime> = {
  '18': lambda.Runtime.NODEJS_18_X,
  '20': lambda.Runtime.NODEJS_20_X
}

export class RevalidateLambda extends Construct {
  public readonly lambda: lambda.Function
  public readonly lambdaHttpUrl: lambda.FunctionUrl

  constructor(scope: Construct, id: string, props: RevalidateLambdaProps) {
    const { nodejs, buildOutputPath, sqsRegion, sqsQueueUrl } = props
    super(scope, id)

    const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20']
    const name = 'revalidate'

    buildLambda(name, buildOutputPath)

    const logGroup = new logs.LogGroup(this, 'RevalidateLambdaLogGroup', {
      logGroupName: `/aws/lambda/${id}-${name}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.FIVE_DAYS
    })

    this.lambda = new lambda.Function(this, 'RevalidateLambda', {
      runtime: nodeJSEnvironment,
      code: lambda.Code.fromAsset(path.join(buildOutputPath, 'server-functions', name)),
      handler: 'index.handler',
      logGroup,
      environment: {
        SQS_AWS_REGION: sqsRegion,
        SECRET_ID: 'x-api-key',
        SQS_QUEUE_URL: sqsQueueUrl
      }
    })

    logGroup.grantWrite(this.lambda)

    const policyStatement = new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`${logGroup.logGroupArn}:*`]
    })

    this.lambda.addToRolePolicy(policyStatement)

    this.lambdaHttpUrl = this.lambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM
    })

    addOutput(this, `${id}-RevalidateLambdaUrl`, this.lambdaHttpUrl.url)
  }
}
