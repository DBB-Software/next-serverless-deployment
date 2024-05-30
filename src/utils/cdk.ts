import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  CloudFormationClient,
  DescribeStacksCommand,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  CloudFormationServiceException,
  waitUntilStackCreateComplete,
  waitUntilStackDeleteComplete,
  waitUntilStackUpdateComplete,
  GetTemplateCommand
} from '@aws-sdk/client-cloudformation'
import path from 'node:path'

import { getCDKAssetsPublisher } from '../utils/aws'

export const addOutput = (scope: Construct, exportName: string, value: string) => {
  return new cdk.CfnOutput(scope, exportName, {
    value,
    exportName
  })
}

interface AppStackConstructorWithArgs<T, A> {
  new (app: cdk.App, stackName: string, options: A): T
}

interface AppStackOptions extends cdk.StackProps {
  pruneBeforeDeploy?: boolean
  buildOutputPath: string
  region?: string
  profile?: string
  credentials: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
}

export class AppStack<T extends cdk.Stack, U> {
  public readonly stack: T
  public readonly stackApp: cdk.App
  private readonly cfClient: CloudFormationClient
  private readonly options: AppStackOptions
  public readonly stackName: string
  public readonly stackTemplate: string

  constructor(stackName: string, Stack: AppStackConstructorWithArgs<T, U>, options: U & AppStackOptions) {
    this.stackName = stackName
    this.stackApp = new cdk.App({
      outdir: options.buildOutputPath
    })
    this.cfClient = new CloudFormationClient({
      region: options.region,
      credentials: options.credentials
    })
    this.stack = new Stack(this.stackApp, stackName, options)
    this.options = options
    this.stackTemplate = this.stackApp.synth().getStackByName(stackName).template
  }

  public static CLOUDFORMATION_STACK_WAIT_TIME_SEC = 30 * 60 // 30 minutes

  public describeCurrentStack = async () => {
    const command = new DescribeStacksCommand({ StackName: this.stackName })

    return this.cfClient.send(command).then((r) => r?.Stacks?.[0])
  }
  public getCurrentStackTemplate = async () => {
    const command = new GetTemplateCommand({ StackName: this.stackName })

    const response = await this.cfClient.send(command)
    return response.TemplateBody || ''
  }

  public checkIfStackExists = async () => {
    try {
      const res = await this.describeCurrentStack()

      return !!res
    } catch (err) {
      if (err instanceof CloudFormationServiceException) {
        if (err.name === 'ValidationError') {
          return false
        }
      }

      throw err
    }
  }

  public createStack = async () => {
    const command = new CreateStackCommand({
      StackName: this.stackName,
      TemplateBody: JSON.stringify(this.stackTemplate),
      DisableRollback: true,
      Capabilities: ['CAPABILITY_IAM']
    })

    await this.cfClient.send(command)
    await waitUntilStackCreateComplete(
      { client: this.cfClient, maxWaitTime: AppStack.CLOUDFORMATION_STACK_WAIT_TIME_SEC },
      { StackName: this.stackName }
    )
  }

  public updateStack = async () => {
    const command = new UpdateStackCommand({
      StackName: this.stackName,
      TemplateBody: JSON.stringify(this.stackTemplate),
      Capabilities: ['CAPABILITY_IAM']
    })

    await this.cfClient.send(command)
    await waitUntilStackUpdateComplete(
      { client: this.cfClient, maxWaitTime: AppStack.CLOUDFORMATION_STACK_WAIT_TIME_SEC },
      { StackName: this.stackName }
    )
  }

  public destroyStack = async () => {
    const command = new DeleteStackCommand({
      StackName: this.stackName
    })

    await this.cfClient.send(command)
    await waitUntilStackDeleteComplete(
      { client: this.cfClient, maxWaitTime: AppStack.CLOUDFORMATION_STACK_WAIT_TIME_SEC },
      { StackName: this.stackName }
    )
  }

  public deployStack = async (): Promise<Record<string, string>> => {
    const { pruneBeforeDeploy, buildOutputPath, region, profile } = this.options

    const assetsPublisher = getCDKAssetsPublisher(path.join(buildOutputPath, `${this.stackName}.assets.json`), {
      region: region,
      profile: profile
    })
    await assetsPublisher.publish()

    const ifStackExists = await this.checkIfStackExists()
    if (ifStackExists && pruneBeforeDeploy) {
      await this.destroyStack()
    }

    if (!ifStackExists || (ifStackExists && pruneBeforeDeploy)) {
      await this.createStack()
    }

    if (ifStackExists && !pruneBeforeDeploy) {
      const currentTemplate = await this.getCurrentStackTemplate()
      if (currentTemplate !== JSON.stringify(this.stackTemplate)) {
        await this.updateStack()
      }
    }

    const currentStackInfo = await this.describeCurrentStack()

    return (currentStackInfo?.Outputs ?? []).reduce((prev: Record<string, string>, curr) => {
      return {
        ...prev,
        [curr.ExportName as string]: curr.OutputValue!
      }
    }, {})
  }
}
