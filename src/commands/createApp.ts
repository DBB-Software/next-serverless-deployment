import type { NextConfig } from 'next/types'
import { getSTSIdentity, getAWSCredentials, AWS_EDGE_REGION } from '../common/aws'
import bootstrapCdk from './tasks/bootstrapCdk'
import { AppStack } from '../common/cdk'
import { NextRenderServerStack, type NextRenderServerStackProps } from '../cdk/stacks/NextRenderServerStack'
import { NextCloudfrontStack, type NextCloudfrontStackProps } from '../cdk/stacks/NextCloudfrontStack'
import loadConfig from './helpers/loadConfig'
import { createOutputFolder, cleanOutputFolder } from '../build/next'
import { getProjectSettings, loadFile } from '../common/project'

interface CreateAppProps {
  region?: string
  profile?: string
  siteName: string
  stage?: string
  nodejs?: string
  isProduction?: boolean
  renderServerInstanceType?: string
  renderServerMinInstances?: number
  renderServerMaxInstances?: number
}

export const createApp = async ({
  region,
  profile,
  siteName,
  stage = 'dev',
  nodejs,
  isProduction,
  renderServerInstanceType,
  renderServerMaxInstances,
  renderServerMinInstances
}: CreateAppProps) => {
  try {
    const awsRegion = region || process.env.AWS_REGION

    if (!awsRegion) {
      throw new Error('AWS Region is required.')
    }

    const identity = await getSTSIdentity({ region: awsRegion, profile })
    const credentials = await getAWSCredentials({ region: awsRegion, profile })

    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('AWS Credentials are required.')
    }

    const taskEnv = {
      ...process.env,
      AWS_ACCESS_KEY_ID: credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      AWS_SESSION_TOKEN: credentials.sessionToken,
      AWS_REGION: awsRegion,
      AWS_PROFILE: profile
    }

    bootstrapCdk({ accountId: identity.Account!, region: awsRegion }, taskEnv)

    if (awsRegion !== AWS_EDGE_REGION) {
      bootstrapCdk({ accountId: identity.Account!, region: AWS_EDGE_REGION }, taskEnv)
    }

    const projectSettings = getProjectSettings(process.cwd())

    if (!projectSettings) {
      throw new Error('Was not able to find project settings.')
    }

    // .toLowerCase() is required, since AWS has limitation for resources names
    // that name must contain only lowercase characters.
    if (/[A-Z]/.test(siteName)) {
      console.warn(
        'SiteName should not contain uppercase characters. Updating value to contain only lowercase characters.'
      )
    }
    const siteNameLowerCased = siteName.toLowerCase()

    const deployConfig = await loadConfig()

    const outputPath = createOutputFolder()

    const nextConfig = (await loadFile(projectSettings.nextConfigPath)) as NextConfig

    const clientAWSCredentials = {
      region: awsRegion,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken
      }
    }

    const nextRenderServerStack = new AppStack<NextRenderServerStack, NextRenderServerStackProps>(
      `${siteNameLowerCased}-server`,
      NextRenderServerStack,
      {
        ...clientAWSCredentials,
        buildOutputPath: outputPath,
        profile,
        stage,
        nodejs: nodejs,
        isProduction: isProduction,
        crossRegionReferences: true,
        region: awsRegion,
        renderServerInstanceType,
        renderServerMaxInstances,
        renderServerMinInstances,
        healthCheckPath: deployConfig.healthCheckPath,
        env: {
          region: awsRegion
        }
      }
    )
    const nextRenderServerStackOutput = await nextRenderServerStack.deployStack()

    const nextCloudfrontStack = new AppStack<NextCloudfrontStack, NextCloudfrontStackProps>(
      `${siteNameLowerCased}-cf`,
      NextCloudfrontStack,
      {
        ...clientAWSCredentials,
        profile,
        nodejs,
        stage,
        staticBucketName: nextRenderServerStackOutput.StaticBucketName,
        renderServerDomain: nextRenderServerStackOutput.RenderServerDomain,
        sqsQueueUrl: nextRenderServerStackOutput.RenderWorkerQueueUrl,
        sqsQueueArn: nextRenderServerStackOutput.RenderWorkerQueueArn,
        buildOutputPath: outputPath,
        crossRegionReferences: true,
        region: awsRegion,
        deployConfig,
        imageTTL: nextConfig.imageTTL,
        appName: `${stage}-${siteNameLowerCased}`,
        env: {
          region: AWS_EDGE_REGION // required since Edge can be deployed only here.
        }
      }
    )
    await nextCloudfrontStack.deployStack()
  } catch (err) {
    console.error('Failed to create app:', err)
  } finally {
    cleanOutputFolder()
  }
}
