import { ElasticBeanstalk } from '@aws-sdk/client-elastic-beanstalk'
import { S3 } from '@aws-sdk/client-s3'
import { CloudFront } from '@aws-sdk/client-cloudfront'
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
  let cleanNextApp
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

    const cacheConfig = await loadConfig()

    const nextConfig = await loadFile(projectSettings.nextConfigPath)

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
        renderWorkerQueueUrl: nextRenderServerStackOutput.RenderWorkerQueueUrl,
        renderWorkerQueueArn: nextRenderServerStackOutput.RenderWorkerQueueArn,
        buildOutputPath: outputPath,
        crossRegionReferences: true,
        region,
        cacheConfig,
        imageTTL: nextConfig.imageTTL,
        env: {
          region: AWS_EDGE_REGION // required since Edge can be deployed only here.
        }
      }
    )
    const nextCloudfrontStackOutput = await nextCloudfrontStack.deployStack()

    // Build and zip app.
    cleanNextApp = await buildApp({
      projectSettings,
      outputPath,
      s3BucketName: nextRenderServerStackOutput.StaticBucketName
    })

    const now = Date.now()
    const archivedFolderName = `${OUTPUT_FOLDER}-server-v${now}.zip`
    const buildOutputPathArchived = path.join(outputPath, archivedFolderName)
    const versionLabel = `${OUTPUT_FOLDER}-server-v${now}`

    fs.writeFileSync(
      path.join(outputPath, 'server', 'Procfile'),
      `web: node ${path.join(path.relative(projectSettings.root, projectSettings.projectPath), 'server.js')}`
    )

    childProcess.execSync(`cd ${path.join(outputPath, 'server')} && zip -r ../${archivedFolderName} \\.* *`, {
      stdio: 'inherit'
    })

    // prune static bucket before upload
    await emptyBucket(s3Client, nextRenderServerStackOutput.StaticBucketName)

    await uploadFolderToS3(s3Client, {
      Bucket: nextRenderServerStackOutput.StaticBucketName,
      Key: '_next',
      folderRootPath: outputPath
    })

    // upload code version to bucket.
    await uploadFileToS3(s3Client, {
      Bucket: nextRenderServerStackOutput.RenderServerVersionsBucketName,
      Key: `${versionLabel}.zip`,
      Body: fs.readFileSync(buildOutputPathArchived)
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
      Body: fs.readFileSync(buildOutputPathArchived)
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
      VersionLabel: versionLabel
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
    await cleanNextApp?.()
  }
}
