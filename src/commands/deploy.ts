import {
  CloudFormationClient,
  DescribeStacksCommand,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  TypeNotFoundException
} from '@aws-sdk/client-cloudformation'
import * as cdk from 'aws-cdk-lib'
import { buildApp } from './build'
import { Nextjs } from '../cdk/stacks/nextJs'

export interface DeployConfig {
  siteName: string
  stage?: string
  pruneBeforeDeploy?: boolean
  aws: {
    region?: string
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
  }
}

const checkIfStackExists = async (cf: CloudFormationClient, stackName: string) => {
  const command = new DescribeStacksCommand({ StackName: stackName })

  try {
    await cf.send(command)

    return true
  } catch (err) {
    if (err instanceof TypeNotFoundException) {
      return false
    }

    throw err
  }
}

const createStack = async (cf: CloudFormationClient, stackName: string, template: string) => {
  const command = new CreateStackCommand({
    StackName: stackName,
    TemplateBody: template
  })

  return cf.send(command)
}

const updateStack = async (cf: CloudFormationClient, stackName: string, template: string) => {
  const command = new UpdateStackCommand({
    StackName: stackName,
    TemplateBody: template
  })

  return cf.send(command)
}

const destroyStack = async (cf: CloudFormationClient, stackName: string) => {
  const command = new DeleteStackCommand({
    StackName: stackName
  })

  return cf.send(command)
}

export const deploy = async (config: DeployConfig) => {
  const { pruneBeforeDeploy = false, siteName, stage = 'production', aws } = config
  const accessKeyId = aws.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = aws.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
  const region = aws.region || process.env.REGION

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS Credential are required.')
  }

  buildApp()

  const app = new cdk.App()
  const nextjsStack = new Nextjs(app, `${siteName}-${stage}`)

  const cfTemplate = app.synth().getStackByName(nextjsStack.stackName).template
  const cf = new CloudFormationClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  })

  const ifStackExists = await checkIfStackExists(cf, nextjsStack.stackName)

  if (ifStackExists && pruneBeforeDeploy) {
    await destroyStack(cf, nextjsStack.stackName)
  }

  if (!ifStackExists || (ifStackExists && pruneBeforeDeploy)) {
    await createStack(cf, nextjsStack.stackName, cfTemplate)
  }

  if (ifStackExists && !pruneBeforeDeploy) {
    await updateStack(cf, nextjsStack.stackName, cfTemplate)
  }
}
