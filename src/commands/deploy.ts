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
import { NextRenderServerStack } from '../cdk/stacks/NextRenderServerStack'
import { NextCloudfrontStack } from '../cdk/stacks/NextCloudfrontStack'
import { getAWSCredentials, uploadFolderToS3, uploadFileToS3, getCDKAssetsPublisher } from '../utils/aws'
import path from 'node:path'

export interface DeployConfig {
  siteName: string
  stage?: string
  pruneBeforeDeploy?: boolean
  nodejs?: string
  isProduction?: boolean
  aws: {
    region?: string
    profile?: string
  }
}

export interface DeployStackProps {
  region?: string
  profile?: string
  pruneBeforeDeploy?: boolean
  buildOutputPath: string
  credentials: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
}

const CLOUDFORMATION_STACK_WAIT_TIME_SEC = 30 * 60 // 30 minutes

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
    { client: cf, maxWaitTime: CLOUDFORMATION_STACK_WAIT_TIME_SEC },
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
    { client: cf, maxWaitTime: CLOUDFORMATION_STACK_WAIT_TIME_SEC },
    { StackName: stackName }
  )
}

const destroyStack = async (cf: CloudFormationClient, stackName: string) => {
  const command = new DeleteStackCommand({
    StackName: stackName
  })

  await cf.send(command)
  await waitUntilStackDeleteComplete(
    { client: cf, maxWaitTime: CLOUDFORMATION_STACK_WAIT_TIME_SEC },
    { StackName: stackName }
  )
}

const deployStack = async (
  stack: cdk.Stack,
  stackTemplate: string,
  config: DeployStackProps
): Promise<Record<string, string>> => {
  const { pruneBeforeDeploy, buildOutputPath, region, profile, ...restConfig } = config
  const cf = new CloudFormationClient({
    ...restConfig,
    region,
    logger: console
  })

  const assetsPublisher = getCDKAssetsPublisher(path.join(buildOutputPath, `${stack.stackName}.assets.json`), {
    region: region,
    profile: profile
  })
  await assetsPublisher.publish()

  const ifStackExists = await checkIfStackExists(cf, stack.stackName)
  if (ifStackExists && pruneBeforeDeploy) {
    await destroyStack(cf, stack.stackName)
  }

  if (!ifStackExists || (ifStackExists && pruneBeforeDeploy)) {
    await createStack(cf, stack.stackName, stackTemplate)
  }

  if (ifStackExists && !pruneBeforeDeploy) {
    const currentTemplate = await getCurrentStackTemplate(cf, stack.stackName)
    if (currentTemplate !== JSON.stringify(stackTemplate)) {
      await updateStack(cf, stack.stackName, stackTemplate)
    }
  }

  const result = await cf.send(new DescribeStacksCommand({ StackName: stack.stackName }))

  return result.Stacks![0].Outputs!.reduce((prev: Record<string, string>, curr) => {
    return {
      ...prev,
      [curr.ExportName as string]: curr.OutputValue!
    }
  }, {})
}

const getCurrentStackTemplate = async (cf: CloudFormationClient, stackName: string) => {
  const command = new GetTemplateCommand({ StackName: stackName })

  const response = await cf.send(command)
  return response.TemplateBody || ''
}

export const deploy = async (config: DeployConfig) => {
  const { pruneBeforeDeploy = false, siteName, stage = 'development', aws } = config
  const credentials = await getAWSCredentials({ region: config.aws.region, profile: config.aws.profile })
  const region = aws.region || process.env.REGION

  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('AWS Credentials are required.')
  }

  // Build and zip app.
  const { outputPath: buildOutputPath, buildFolderName } = await buildApp()
  const now = Date.now()
  const archivedFolderName = `${buildFolderName}-server-v${now}.zip`
  const buildOutputPathArchived = path.join(buildOutputPath, archivedFolderName)
  const versionLabel = `${buildFolderName}-server-v${now}`

  fs.writeFileSync(path.join(buildOutputPath, 'server', 'Procfile'), 'web: node server.js')

  childProcess.execSync(`cd ${path.join(buildOutputPath, 'server')} && zip -r ../${archivedFolderName} \\.* *`, {
    stdio: 'inherit'
  })

  const clientAWSCredentials = {
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    }
  }

  const ebClient = new ElasticBeanstalk(clientAWSCredentials)
  const s3Client = new S3(clientAWSCredentials)

  const app = new cdk.App({
    outdir: buildOutputPath
  })

  // .toLowerCase() is required, since AWS has limitation for resources names
  // that name must contain only lowercase characters.
  if (/[A-Z]/.test(siteName)) {
    console.warn(
      'SiteName should not contain uppercase characters. Updating value to contain only lowercase characters.'
    )
  }
  const siteNameLowerCased = siteName.toLowerCase()
  const nextRenderServerStack = new NextRenderServerStack(app, `${siteNameLowerCased}-server`, {
    stage,
    nodejs: config.nodejs,
    isProduction: config.isProduction,
    crossRegionReferences: true,
    env: {
      region
    }
  })
  const nextCloudfrontStack = new NextCloudfrontStack(app, `${siteNameLowerCased}-cf`, {
    nodejs: config.nodejs,
    staticBucketName: nextRenderServerStack.staticBucketName,
    staticBucket: nextRenderServerStack.staticBucket,
    ebEnv: nextRenderServerStack.elasticbeanstalk.ebEnv,
    ebAppUrl: '', // nextRenderServerStackInfo.BeanstalkURL
    buildOutputPath,
    crossRegionReferences: true,
    env: {
      region: 'us-east-1' // required for edge
    }
  })
  const assembly = app.synth()
  const nextRenderServerStackTemplate = assembly.getStackByName(nextRenderServerStack.stackName).template
  await deployStack(nextRenderServerStack, nextRenderServerStackTemplate, {
    ...clientAWSCredentials,
    pruneBeforeDeploy,
    buildOutputPath,
    profile: config.aws.profile
  })

  const nextCloudfrontStackTemplate = assembly.getStackByName(nextCloudfrontStack.stackName).template
  await deployStack(nextCloudfrontStack, nextCloudfrontStackTemplate, {
    ...clientAWSCredentials,
    pruneBeforeDeploy,
    buildOutputPath,
    profile: config.aws.profile,
    region: 'us-east-1'
  })

  // upload static assets.
  await uploadFolderToS3(s3Client, {
    Bucket: nextRenderServerStack.staticBucketName,
    Key: '_next',
    folderRootPath: buildOutputPath
  })

  // upload code version to bucket.
  await uploadFileToS3(s3Client, {
    Bucket: nextRenderServerStack.elasticbeanstalk.s3VersionsBucketName,
    Key: `${versionLabel}.zip`,
    Body: fs.readFileSync(buildOutputPathArchived)
  })

  await ebClient.createApplicationVersion({
    ApplicationName: nextRenderServerStack.elasticbeanstalk.ebApp.applicationName!,
    VersionLabel: versionLabel,
    SourceBundle: {
      S3Bucket: nextRenderServerStack.elasticbeanstalk.s3VersionsBucketName,
      S3Key: `${versionLabel}.zip`
    }
  })

  await ebClient.updateEnvironment({
    ApplicationName: nextRenderServerStack.elasticbeanstalk.ebApp.applicationName,
    EnvironmentName: nextRenderServerStack.elasticbeanstalk.ebEnv.environmentName,
    VersionLabel: versionLabel
  })
}
