import { ElasticBeanstalk } from '@aws-sdk/client-elastic-beanstalk'
import { S3 } from '@aws-sdk/client-s3'
import { CloudFront } from '@aws-sdk/client-cloudfront'
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation'
import { LambdaClient, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda'
import type { NextConfig } from 'next/types'
import fs from 'node:fs'
import childProcess from 'node:child_process'
import path from 'node:path'
import { buildApp, OUTPUT_FOLDER, createOutputFolder, cleanOutputFolder } from '../build/next'
import { getAWSCredentials, uploadFolderToS3, uploadFileToS3, AWS_EDGE_REGION, emptyBucket } from '../common/aws'
import { AppStack } from '../common/cdk'
import { getProjectSettings, loadFile } from '../common/project'
import loadConfig from './helpers/loadConfig'
import { buildRevalidateServer, buildLambda } from '../common/esbuild'

export interface DeployConfig {
  siteName: string
  stage?: string
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

export const deploy = async (config: DeployConfig) => {
  try {
    const { siteName, stage = 'dev', aws } = config
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
    const cfClient = new CloudFormationClient(clientAWSCredentials)
    const cfEdgeClient = new CloudFormationClient({
      ...clientAWSCredentials,
      region: AWS_EDGE_REGION
    })
    const lambdaClient = new LambdaClient({
      ...clientAWSCredentials,
      region: AWS_EDGE_REGION
    })
    // .toLowerCase() is required, since AWS has limitation for resources names
    // that name must contain only lowercase characters.
    if (/[A-Z]/.test(siteName)) {
      console.warn(
        'SiteName should not contain uppercase characters. Updating value to contain only lowercase characters.'
      )
    }
    const siteNameLowerCased = `${stage}-${siteName.toLowerCase()}`

    // Build and zip app.
    const { cachedRoutesMatchers, rewritesConfig, redirectsConfig } = await buildApp({
      projectSettings,
      outputPath
    })

    const nextRenderStackOutput = await cfClient
      .send(new DescribeStacksCommand({ StackName: `${siteNameLowerCased}-server` }))
      .then((r) => r?.Stacks?.[0])

    if (!nextRenderStackOutput) {
      throw new Error(
        `Stack ${siteNameLowerCased}-server not found. Please make sure that app was created and you run createApp command.`
      )
    }

    const nextRenderStackOutputVariables = AppStack.transformStackOutput(nextRenderStackOutput)

    const nextCloudFrontStackOutput = await cfEdgeClient
      .send(new DescribeStacksCommand({ StackName: `${siteNameLowerCased}-cf` }))
      .then((r) => r?.Stacks?.[0])

    if (!nextCloudFrontStackOutput) {
      throw new Error(
        `Stack ${siteNameLowerCased}-cf not found. Please make sure that app was created and you run createApp command.`
      )
    }

    const nextCloudFrontStackOutputVariables = AppStack.transformStackOutput(nextCloudFrontStackOutput)

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

    // build edge lambdas code
    await Promise.all([
      buildLambda('originRequest', outputPath, {
        define: {
          'process.env.S3_BUCKET': JSON.stringify(nextRenderStackOutputVariables.StaticBucketName),
          'process.env.S3_BUCKET_REGION': JSON.stringify(region),
          'process.env.EB_APP_URL': JSON.stringify(nextRenderStackOutputVariables.RenderServerDomain),
          'process.env.CACHE_CONFIG': JSON.stringify(deployConfig.cache),
          'process.env.NEXT_CACHED_ROUTES_MATCHERS': JSON.stringify(cachedRoutesMatchers ?? [])
        }
      }),
      buildLambda('viewerRequest', outputPath, {
        define: {
          'process.env.REDIRECTS': JSON.stringify(redirectsConfig ?? []),
          'process.env.LOCALES_CONFIG': JSON.stringify(nextI18nConfig ?? null),
          'process.env.IS_TRAILING_SLASH_ENABLED': JSON.stringify(isTrailingSlashEnabled),
          'process.env.NEXT_REWRITES_CONFIG': JSON.stringify(rewritesConfig ?? [])
        }
      })
    ])

    // zip lambdas
    childProcess.execSync(`cd ${outputPath}/server-functions && zip -r originRequest.zip ./originRequest`)
    childProcess.execSync(`cd ${outputPath}/server-functions && zip -r viewerRequest.zip ./viewerRequest`)

    // prune static bucket before upload
    await emptyBucket(s3Client, nextRenderStackOutputVariables.StaticBucketName)

    // upload artifacts to s3
    await Promise.all([
      uploadFolderToS3(s3Client, {
        Bucket: nextRenderStackOutputVariables.StaticBucketName,
        Key: '_next/static',
        folderRootPath: path.join(outputPath, '.next', 'static')
      }),
      uploadFolderToS3(s3Client, {
        Bucket: nextRenderStackOutputVariables.StaticBucketName,
        Key: 'public',
        folderRootPath: path.join(
          outputPath,
          '.next',
          'standalone',
          path.relative(projectSettings.root, projectSettings.projectPath),
          'public'
        )
      }),
      uploadFileToS3(s3Client, {
        Bucket: nextRenderStackOutputVariables.RenderServerVersionsBucketName,
        Key: `${versionLabel}.zip`,
        Body: fs.readFileSync(buildOutputRenderServerPathArchived)
      }),
      uploadFileToS3(s3Client, {
        Bucket: nextRenderStackOutputVariables.RenderWorkerVersionsBucketName,
        Key: `${versionLabel}.zip`,
        Body: fs.readFileSync(buildOutputRenderWorkerPathArchived)
      })
    ])

    // create new applications versions
    await Promise.all([
      ebClient.createApplicationVersion({
        ApplicationName: nextRenderStackOutputVariables.RenderServerApplicationName,
        VersionLabel: versionLabel,
        SourceBundle: {
          S3Bucket: nextRenderStackOutputVariables.RenderServerVersionsBucketName,
          S3Key: `${versionLabel}.zip`
        }
      }),
      ebClient.createApplicationVersion({
        ApplicationName: nextRenderStackOutputVariables.RenderWorkerApplicationName,
        VersionLabel: versionLabel,
        SourceBundle: {
          S3Bucket: nextRenderStackOutputVariables.RenderWorkerVersionsBucketName,
          S3Key: `${versionLabel}.zip`
        }
      })
    ])

    // update environments with new versions
    await Promise.all([
      ebClient.updateEnvironment({
        ApplicationName: nextRenderStackOutputVariables.RenderServerApplicationName,
        EnvironmentName: nextRenderStackOutputVariables.RenderServerEnvironmentName,
        VersionLabel: versionLabel
      }),
      ebClient.updateEnvironment({
        ApplicationName: nextRenderStackOutputVariables.RenderWorkerApplicationName,
        EnvironmentName: nextRenderStackOutputVariables.RenderWorkerEnvironmentName,
        VersionLabel: versionLabel,
        OptionSettings: [
          {
            Namespace: 'aws:elasticbeanstalk:application:environment',
            OptionName: 'CLOUDFRONT_DISTRIBUTION_ID',
            Value: nextCloudFrontStackOutputVariables.CloudfrontDistributionId!
          }
        ]
      })
    ])

    await Promise.all([
      lambdaClient.send(
        new UpdateFunctionCodeCommand({
          FunctionName: nextCloudFrontStackOutputVariables.OriginRequestLambdaEdgeName,
          ZipFile: new Uint8Array(fs.readFileSync(path.join(outputPath, 'server-functions', 'originRequest.zip')))
        })
      ),
      lambdaClient.send(
        new UpdateFunctionCodeCommand({
          FunctionName: nextCloudFrontStackOutputVariables.ViewerRequestLambdaEdgeName,
          ZipFile: new Uint8Array(fs.readFileSync(path.join(outputPath, 'server-functions', 'viewerRequest.zip')))
        })
      )
    ])

    await cloudfrontClient.createInvalidation({
      DistributionId: nextCloudFrontStackOutputVariables.CloudfrontDistributionId!,
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
