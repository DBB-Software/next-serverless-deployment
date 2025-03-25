import { ElasticBeanstalk } from '@aws-sdk/client-elastic-beanstalk'
import { S3 } from '@aws-sdk/client-s3'
import { CloudFront } from '@aws-sdk/client-cloudfront'
import type { NextConfig } from 'next/types'
import fs from 'node:fs'
import childProcess from 'node:child_process'
import path from 'node:path'
import { buildApp, OUTPUT_FOLDER } from '../build/next'
import { NextRenderServerStack, type NextRenderServerStackProps } from '../cdk/stacks/NextRenderServerStack'
import { NextCloudfrontStack, type NextCloudfrontStackProps } from '../cdk/stacks/NextCloudfrontStack'
import { getAWSCredentials, uploadFolderToS3, uploadFileToS3, AWS_EDGE_REGION, emptyBucket } from '../common/aws'
import { AppStack } from '../common/cdk'
import { getProjectSettings, loadFile } from '../common/project'
import loadConfig from './helpers/loadConfig'
import { buildRevalidateServer } from '../common/esbuild'

export interface DeployConfig {
  siteName: string
  stage?: string
  nodejs?: string
  isProduction?: boolean
  renderServerInstanceType?: string
  renderServerMinInstances?: number
  renderServerMaxInstances?: number
  aws: {
    region?: string
    profile?: string
  }
}

export interface DeployStackProps {
  region?: string
  profile?: string
  buildOutputPath: string
  credentials: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
}

const cleanOutputFolder = () => {
  const outputFolderPath = path.join(process.cwd(), OUTPUT_FOLDER)

  fs.rmSync(outputFolderPath, { recursive: true, force: true })
}

const createOutputFolder = () => {
  const outputFolderPath = path.join(process.cwd(), OUTPUT_FOLDER)
  // clean folder before creating new build output.
  cleanOutputFolder()

  fs.mkdirSync(outputFolderPath)

  return outputFolderPath
}

export const deploy = async (config: DeployConfig) => {
  try {
    const {
      siteName,
      stage = 'development',
      aws,
      renderServerInstanceType,
      renderServerMaxInstances,
      renderServerMinInstances
    } = config
    const credentials = await getAWSCredentials({ region: config.aws.region, profile: config.aws.profile })
    const region = aws.region || process.env.REGION

    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('AWS Credentials are required.')
    }

    if (!region) {
      throw new Error('AWS Region is required.')
    }

    const projectSettings = getProjectSettings(process.cwd())

    if (!projectSettings) {
      throw new Error('Was not able to find project settings.')
    }

    const deployConfig = await loadConfig()

    const nextConfig = (await loadFile(projectSettings.nextConfigPath)) as NextConfig
    const nextI18nConfig = nextConfig.i18n
    const isTrailingSlashEnabled = nextConfig.trailingSlash ?? false

    const outputPath = createOutputFolder()

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
    const cloudfrontClient = new CloudFront(clientAWSCredentials)

    // .toLowerCase() is required, since AWS has limitation for resources names
    // that name must contain only lowercase characters.
    if (/[A-Z]/.test(siteName)) {
      console.warn(
        'SiteName should not contain uppercase characters. Updating value to contain only lowercase characters.'
      )
    }
    const siteNameLowerCased = siteName.toLowerCase()

    // Build and zip app.
    const { cachedRoutesMatchers, rewritesConfig, redirectsConfig } = await buildApp({
      projectSettings,
      outputPath
    })

    const nextRenderServerStack = new AppStack<NextRenderServerStack, NextRenderServerStackProps>(
      `${siteNameLowerCased}-server`,
      NextRenderServerStack,
      {
        ...clientAWSCredentials,
        buildOutputPath: outputPath,
        profile: config.aws.profile,
        stage,
        nodejs: config.nodejs,
        isProduction: config.isProduction,
        crossRegionReferences: true,
        region,
        renderServerInstanceType,
        renderServerMaxInstances,
        renderServerMinInstances,
        env: {
          region
        }
      }
    )

    const nextRenderServerStackOutput = await nextRenderServerStack.deployStack()

    const nextCloudfrontStack = new AppStack<NextCloudfrontStack, NextCloudfrontStackProps>(
      `${siteNameLowerCased}-cf`,
      NextCloudfrontStack,
      {
        ...clientAWSCredentials,
        profile: config.aws.profile,
        nodejs: config.nodejs,
        staticBucketName: nextRenderServerStackOutput.StaticBucketName,
        renderServerDomain: nextRenderServerStackOutput.RenderServerDomain,
        sqsQueueUrl: nextRenderServerStackOutput.RenderWorkerQueueUrl,
        sqsQueueArn: nextRenderServerStackOutput.RenderWorkerQueueArn,
        buildOutputPath: outputPath,
        crossRegionReferences: true,
        region,
        deployConfig,
        imageTTL: nextConfig.imageTTL,
        nextI18nConfig,
        redirectsConfig,
        cachedRoutesMatchers,
        rewritesConfig,
        isTrailingSlashEnabled,
        env: {
          region: AWS_EDGE_REGION // required since Edge can be deployed only here.
        }
      }
    )
    const nextCloudfrontStackOutput = await nextCloudfrontStack.deployStack()

    const now = Date.now()
    const archivedRenderServerFolderName = `${OUTPUT_FOLDER}-render-server-v${now}.zip`
    const buildOutputRenderServerPathArchived = path.join(outputPath, archivedRenderServerFolderName)
    const archivedRenderWorkerFolderName = `${OUTPUT_FOLDER}-worker-server-v${now}.zip`
    const buildOutputRenderWorkerPathArchived = path.join(outputPath, archivedRenderWorkerFolderName)
    const versionLabel = `${OUTPUT_FOLDER}-server-v${now}`

    fs.writeFileSync(
      path.join(outputPath, '.next', 'Procfile'),
      `web: node ${path.join(path.relative(projectSettings.root, projectSettings.projectPath), 'server.js')}`
    )

    childProcess.execSync(
      `cd ${path.join(outputPath, '.next', 'standalone')} && zip -r ../../${archivedRenderServerFolderName} \\.* *`,
      {
        stdio: 'inherit'
      }
    )

    buildRevalidateServer('revalidateServer', path.join(outputPath, '.next'))

    fs.writeFileSync(
      path.join(outputPath, '.next', 'Procfile'),
      `web: node ./next-handlers/revalidateServer.js & PORT=3001 node ${path.join(path.relative(projectSettings.root, projectSettings.projectPath), 'server.js')}`
    )

    childProcess.execSync(
      `cd ${path.join(outputPath, '.next', 'standalone')} && zip -r ../../${archivedRenderWorkerFolderName} \\.* *`,
      {
        stdio: 'inherit'
      }
    )

    // prune static bucket before upload
    await emptyBucket(s3Client, nextRenderServerStackOutput.StaticBucketName)

    await uploadFolderToS3(s3Client, {
      Bucket: nextRenderServerStackOutput.StaticBucketName,
      Key: '_next/static',
      folderRootPath: path.join(outputPath, '.next', 'static')
    })

    await uploadFolderToS3(s3Client, {
      Bucket: nextRenderServerStackOutput.StaticBucketName,
      Key: 'public',
      folderRootPath: path.join(
        outputPath,
        '.next',
        'standalone',
        path.relative(projectSettings.root, projectSettings.projectPath),
        'public'
      )
    })

    // upload code version to bucket.
    await uploadFileToS3(s3Client, {
      Bucket: nextRenderServerStackOutput.RenderServerVersionsBucketName,
      Key: `${versionLabel}.zip`,
      Body: fs.readFileSync(buildOutputRenderServerPathArchived)
    })

    await ebClient.createApplicationVersion({
      ApplicationName: nextRenderServerStackOutput.RenderServerApplicationName,
      VersionLabel: versionLabel,
      SourceBundle: {
        S3Bucket: nextRenderServerStackOutput.RenderServerVersionsBucketName,
        S3Key: `${versionLabel}.zip`
      }
    })

    await ebClient.updateEnvironment({
      ApplicationName: nextRenderServerStackOutput.RenderServerApplicationName,
      EnvironmentName: nextRenderServerStackOutput.RenderServerEnvironmentName,
      VersionLabel: versionLabel
    })

    // upload code version to bucket.
    await uploadFileToS3(s3Client, {
      Bucket: nextRenderServerStackOutput.RenderWorkerVersionsBucketName,
      Key: `${versionLabel}.zip`,
      Body: fs.readFileSync(buildOutputRenderWorkerPathArchived)
    })

    await ebClient.createApplicationVersion({
      ApplicationName: nextRenderServerStackOutput.RenderWorkerApplicationName,
      VersionLabel: versionLabel,
      SourceBundle: {
        S3Bucket: nextRenderServerStackOutput.RenderWorkerVersionsBucketName,
        S3Key: `${versionLabel}.zip`
      }
    })

    await ebClient.updateEnvironment({
      ApplicationName: nextRenderServerStackOutput.RenderWorkerApplicationName,
      EnvironmentName: nextRenderServerStackOutput.RenderWorkerEnvironmentName,
      VersionLabel: versionLabel,
      OptionSettings: [
        {
          Namespace: 'aws:elasticbeanstalk:application:environment',
          OptionName: 'CLOUDFRONT_DISTRIBUTION_ID',
          Value: nextCloudfrontStackOutput.CloudfrontDistributionId!
        }
      ]
    })

    await cloudfrontClient.createInvalidation({
      DistributionId: nextCloudfrontStackOutput.CloudfrontDistributionId!,
      InvalidationBatch: {
        CallerReference: `deploy-cache-invalidation-${now}`,
        Paths: {
          Quantity: 1,
          Items: ['/*']
        }
      }
    })
  } catch (err) {
    console.error('Failed to deploy:', err)
  } finally {
    cleanOutputFolder()
  }
}
