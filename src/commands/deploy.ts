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
import { ElasticBeanstalk } from '@aws-sdk/client-elastic-beanstalk'
import { S3 } from '@aws-sdk/client-s3'
import * as cdk from 'aws-cdk-lib'
import fs from 'node:fs'
import childProcess from 'node:child_process'
import { buildApp } from './build'
import { Nextjs } from '../cdk/stacks/nextJs'
import { getAWSCredentials } from '../utils/aws'
import path from 'node:path'

export interface DeployConfig {
  siteName: string
  stage?: string
  pruneBeforeDeploy?: boolean
  aws: {
    region?: string
    profile?: string
  }
}

const CLOUDFORMATION_STACK_WAIT_TIME = 10 * 60 // 10 minutes

const checkIfStackExists = async (cf: CloudFormationClient, stackName: string) => {
  const command = new DescribeStacksCommand({ StackName: stackName })

  try {
    await cf.send(command)

    return true
  } catch (err) {
    if (err instanceof CloudFormationServiceException) {
      if (err.name === 'ValidationError') {
        return false
      }
    }

    throw err
  }
}

const createStack = async (cf: CloudFormationClient, stackName: string, template: string) => {
  const command = new CreateStackCommand({
    StackName: stackName,
    TemplateBody: JSON.stringify(template),
    DisableRollback: true,
    Capabilities: ['CAPABILITY_IAM']
  })

  await cf.send(command)
  await waitUntilStackCreateComplete(
    { client: cf, maxWaitTime: CLOUDFORMATION_STACK_WAIT_TIME },
    { StackName: stackName }
  )
}

const updateStack = async (cf: CloudFormationClient, stackName: string, template: string) => {
  const command = new UpdateStackCommand({
    StackName: stackName,
    TemplateBody: JSON.stringify(template),
    Capabilities: ['CAPABILITY_IAM']
  })

  await cf.send(command)
  await waitUntilStackUpdateComplete(
    { client: cf, maxWaitTime: CLOUDFORMATION_STACK_WAIT_TIME },
    { StackName: stackName }
  )
}

const destroyStack = async (cf: CloudFormationClient, stackName: string) => {
  const command = new DeleteStackCommand({
    StackName: stackName
  })

  await cf.send(command)
  await waitUntilStackDeleteComplete(
    { client: cf, maxWaitTime: CLOUDFORMATION_STACK_WAIT_TIME },
    { StackName: stackName }
  )
}

const getCurrentStackTemplate = async (cf: CloudFormationClient, stackName: string) => {
  const command = new GetTemplateCommand({ StackName: stackName })

  const response = await cf.send(command)
  return response.TemplateBody || ''
}

export const deploy = async (config: DeployConfig) => {
  const { pruneBeforeDeploy = false, siteName, stage = 'production', aws } = config
  const credentials = await getAWSCredentials({ region: config.aws.region, profile: config.aws.profile })
  const region = aws.region || process.env.REGION

  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('AWS Credentials are required.')
  }

  const clientAWSCredentials = {
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    }
  }

  const { outputPath: buildOutputPath, buildFolderName } = buildApp()
  const now = Date.now()
  const archivedFolderName = `${buildFolderName}-v${now}.zip`
  const buildOutputPathArchived = `${buildOutputPath}-v${now}.zip`
  const versionLabel = `${buildFolderName}-v${now}`

  fs.writeFileSync(path.join(buildOutputPath, 'Procfile'), 'web: node server.js')

  childProcess.execSync(`cd ${buildOutputPath} && zip -r ../${archivedFolderName} \\.* *`, {
    stdio: 'inherit'
  })

  const cf = new CloudFormationClient(clientAWSCredentials)
  const ebClient = new ElasticBeanstalk(clientAWSCredentials)
  const s3Client = new S3(clientAWSCredentials)

  const app = new cdk.App()
  // .toLowerCase() is required, since AWS has limitation for resources names
  // that name must contain only lowercase characters.
  const nextjsStack = new Nextjs(app, siteName.toLowerCase(), { stage })

  const cfTemplate = app.synth().getStackByName(nextjsStack.stackName).template

  const ifStackExists = await checkIfStackExists(cf, nextjsStack.stackName)
  if (ifStackExists && pruneBeforeDeploy) {
    await destroyStack(cf, nextjsStack.stackName)
  }

  if (!ifStackExists || (ifStackExists && pruneBeforeDeploy)) {
    await createStack(cf, nextjsStack.stackName, cfTemplate)
  }

  if (ifStackExists && !pruneBeforeDeploy) {
    const currentTemplate = await getCurrentStackTemplate(cf, nextjsStack.stackName)
    if (currentTemplate !== JSON.stringify(cfTemplate)) {
      await updateStack(cf, nextjsStack.stackName, cfTemplate)
    }
  }

  await s3Client.putObject({
    Bucket: nextjsStack.elasticbeanstalk.s3VersionsBucketName,
    Key: `${versionLabel}.zip`,
    Body: fs.readFileSync(buildOutputPathArchived)
  })

  await ebClient.createApplicationVersion({
    ApplicationName: nextjsStack.elasticbeanstalk.ebApp.applicationName!,
    VersionLabel: versionLabel,
    SourceBundle: {
      S3Bucket: nextjsStack.elasticbeanstalk.s3VersionsBucketName,
      S3Key: `${versionLabel}.zip`
    }
  })

  await ebClient.updateEnvironment({
    ApplicationName: nextjsStack.elasticbeanstalk.ebApp.applicationName,
    EnvironmentName: nextjsStack.elasticbeanstalk.ebEnv.environmentName,
    VersionLabel: versionLabel
  })
}
