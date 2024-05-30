import { ElasticBeanstalk } from '@aws-sdk/client-elastic-beanstalk'
import { S3 } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import childProcess from 'node:child_process'
import { buildApp } from './build'
import { NextRenderServerStack, type NextRenderServerStackProps } from '../cdk/stacks/NextRenderServerStack'
import { NextCloudfrontStack, type NextCloudfrontStackProps } from '../cdk/stacks/NextCloudfrontStack'
import { getAWSCredentials, uploadFolderToS3, uploadFileToS3 } from '../utils/aws'
import { AppStack } from '../utils/cdk'
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

  // .toLowerCase() is required, since AWS has limitation for resources names
  // that name must contain only lowercase characters.
  if (/[A-Z]/.test(siteName)) {
    console.warn(
      'SiteName should not contain uppercase characters. Updating value to contain only lowercase characters.'
    )
  }
  const siteNameLowerCased = siteName.toLowerCase()

  const nextRenderServerStack = new AppStack<NextRenderServerStack, NextRenderServerStackProps>(
    `${siteNameLowerCased}-server`,
    NextRenderServerStack,
    {
      pruneBeforeDeploy,
      buildOutputPath,
      profile: config.aws.profile,
      credentials,
      stage,
      nodejs: config.nodejs,
      isProduction: config.isProduction,
      crossRegionReferences: true,
      env: {
        region
      }
    }
  )
  const nextRenderServerStackOutput = await nextRenderServerStack.deployStack().then(async (output) => {
    // upload static assets.
    await uploadFolderToS3(s3Client, {
      Bucket: output.StaticBucketName,
      Key: '_next',
      folderRootPath: buildOutputPath
    })

    // upload code version to bucket.
    await uploadFileToS3(s3Client, {
      Bucket: output.BeanstalkVersionsBucketName,
      Key: `${versionLabel}.zip`,
      Body: fs.readFileSync(buildOutputPathArchived)
    })

    await ebClient.createApplicationVersion({
      ApplicationName: output.BeanstalkApplicationName,
      VersionLabel: versionLabel,
      SourceBundle: {
        S3Bucket: output.StaticBucketName,
        S3Key: `${versionLabel}.zip`
      }
    })

    await ebClient.updateEnvironment({
      ApplicationName: output.BeanstalkApplicationName,
      EnvironmentName: output.BeanstalkEnvironmentName,
      VersionLabel: versionLabel
    })

    return output
  })

  const nextCloudfrontStack = new AppStack<NextCloudfrontStack, NextCloudfrontStackProps>(
    `${siteNameLowerCased}-cf`,
    NextCloudfrontStack,
    {
      pruneBeforeDeploy,
      profile: config.aws.profile,
      credentials,
      nodejs: config.nodejs,
      staticBucketName: nextRenderServerStackOutput.StaticBucketName,
      ebAppDomain: nextRenderServerStackOutput.BeanstalkDomain,
      buildOutputPath,
      crossRegionReferences: true,
      region,
      env: {
        region: 'us-east-1' // required since Edge can be deployed only here.
      }
    }
  )
  await nextCloudfrontStack.deployStack()
}
