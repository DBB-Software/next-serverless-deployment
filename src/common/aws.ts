import { fromNodeProviderChain, fromEnv, fromIni } from '@aws-sdk/credential-providers'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { S3, PutObjectCommandInput, ListObjectsV2Output } from '@aws-sdk/client-s3'
import { AssetManifest, AssetPublishing, type IAws } from 'cdk-assets'
import * as AWS from 'aws-sdk'
import { partition } from '@aws-sdk/util-endpoints'
import fs from 'node:fs'
import path from 'node:path'
import {
  CloudFront,
  UpdateDistributionCommand,
  GetDistributionCommand,
  CacheBehavior,
  GetDistributionCommandOutput,
  Distribution
} from '@aws-sdk/client-cloudfront'
import { LambdaEdgeEventType } from 'aws-cdk-lib/aws-cloudfront'
import { UpdateCloudFrontDistribution } from '../types'

type GetAWSBasicProps =
  | {
      region?: string
    }
  | {
      region?: string
      profile?: string
    }
  | void

type S3UploadFolderOptions = PutObjectCommandInput & { folderRootPath: string; Key: string }

export const AWS_EDGE_REGION = 'us-east-1'

export const S3_KEYS_LIMIT = 1000

export const getAWSCredentials = async (props: GetAWSBasicProps) => {
  const credentials = await fromNodeProviderChain({
    ...(props && 'profile' in props && props.profile ? await fromIni({ profile: props.profile }) : await fromEnv()),
    ...(props?.region && { clientConfig: { region: props.region } })
  })({})

  return credentials
}

export const getSTSIdentity = async (props: GetAWSBasicProps) => {
  const stsClient = new STSClient({
    region: props?.region,
    credentials: await getAWSCredentials(props)
  })

  const identity = await stsClient.send(new GetCallerIdentityCommand({}))

  return identity
}

export const getFileContentType = (filePath?: string) => {
  if (!filePath) return

  const extension = path.extname(filePath)

  switch (extension) {
    case '.css':
      return 'text/css'
    case '.js':
      return 'application/javascript'
    case '..html':
      return 'text/html'
    default:
      return 'application/octet-stream'
  }
}

export const uploadFileToS3 = async (s3Client: S3, options: PutObjectCommandInput) => {
  return s3Client.putObject({
    ...options,
    ContentType: getFileContentType(options.Key)
  })
}

export const uploadFolderToS3 = async (s3Client: S3, options: S3UploadFolderOptions) => {
  const { folderRootPath, Key, ...s3UploadOptions } = options
  const files = fs.readdirSync(path.join(folderRootPath, Key))

  for (const file of files) {
    const filePath = path.join(folderRootPath, Key, file)
    const s3FilePath = path.join(Key, file)

    if (fs.lstatSync(filePath).isDirectory()) {
      await uploadFolderToS3(s3Client, {
        ...s3UploadOptions,
        Key: s3FilePath,
        folderRootPath
      })
    } else {
      await uploadFileToS3(s3Client, {
        ...s3UploadOptions,
        Key: s3FilePath,
        Body: fs.createReadStream(filePath)
      })
    }
  }
}

export const listAllObjects = async (s3Client: S3, bucketName: string): Promise<ListObjectsV2Output['Contents']> => {
  const objects = []
  let continuationToken: string | undefined

  do {
    const { Contents: contents = [], NextContinuationToken: token } = await s3Client.listObjectsV2({
      Bucket: bucketName,
      ContinuationToken: continuationToken
    })
    objects.push(...contents)
    continuationToken = token
  } while (continuationToken)

  return objects
}

async function deleteObjects(s3Client: S3, bucketName: string, items: ListObjectsV2Output['Contents']) {
  if (items?.length) {
    return s3Client.deleteObjects({
      Bucket: bucketName,
      Delete: {
        Objects: items.map((item) => ({ Key: item.Key })),
        Quiet: true
      }
    })
  }
}

export const emptyBucket = async (s3Client: S3, bucketName: string) => {
  const bucketItems = await listAllObjects(s3Client, bucketName)

  if (bucketItems?.length) {
    const deletePromises = []

    for (let i = 0; i < bucketItems.length; i += S3_KEYS_LIMIT) {
      const itemsToDelete = bucketItems.slice(i, i + S3_KEYS_LIMIT)
      deletePromises.push(deleteObjects(s3Client, bucketName, itemsToDelete))
    }
    await Promise.all(deletePromises)
  }
}

export class AWSClient implements IAws {
  private readonly region?: string
  private readonly profile?: string

  constructor(region?: string, profile?: string) {
    this.region = region
    this.profile = profile
  }

  public async discoverDefaultRegion(): Promise<string> {
    return this.region ?? ''
  }

  public async discoverPartition() {
    return partition(this.region ?? '').name
  }

  public async discoverCurrentAccount() {
    const { Account } = await getSTSIdentity({
      region: this.region,
      profile: this.profile
    })

    return {
      accountId: Account!,
      partition: await this.discoverPartition()!
    }
  }

  public async discoverTargetAccount() {
    return this.discoverCurrentAccount()
  }

  public async s3Client() {
    const creds = await getAWSCredentials({
      region: this.region,
      profile: this.profile
    })
    return new AWS.S3({ region: this.region, credentials: creds })
  }

  public async ecrClient() {
    const creds = await getAWSCredentials({
      region: this.region,
      profile: this.profile
    })
    return new AWS.ECR({ region: this.region, credentials: creds })
  }

  public async secretsManagerClient() {
    const creds = await getAWSCredentials({
      region: this.region,
      profile: this.profile
    })
    return new AWS.SecretsManager({ region: this.region, credentials: creds })
  }
}

export const getCDKAssetsPublisher = (
  manifestPath: string,
  { region, profile }: { region?: string; profile?: string }
) => {
  return new AssetPublishing(AssetManifest.fromFile(manifestPath), { aws: new AWSClient(region, profile) })
}

const behaviorMapper = (config: {
  targetOriginId?: string
  functionArn?: string
  cachePolicyId: string
  pathPattern?: string
}): CacheBehavior => {
  const { pathPattern, targetOriginId, functionArn, cachePolicyId } = config

  return {
    PathPattern: pathPattern,
    TargetOriginId: targetOriginId,
    ViewerProtocolPolicy: 'allow-all',
    LambdaFunctionAssociations: functionArn
      ? {
          Quantity: 1,
          Items: [
            {
              EventType: LambdaEdgeEventType.ORIGIN_REQUEST,
              LambdaFunctionARN: functionArn
            }
          ]
        }
      : {
          Quantity: 0,
          Items: []
        },
    CachePolicyId: cachePolicyId,
    SmoothStreaming: false,
    Compress: true,
    FieldLevelEncryptionId: '',
    AllowedMethods: {
      Quantity: 2,
      Items: ['GET', 'HEAD'],
      CachedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD']
      }
    }
  }
}

export const getCloudFrontDistribution = async (cfClient: CloudFront, distributionId: string) => {
  const command = new GetDistributionCommand({ Id: distributionId })
  const response = await cfClient.send(command)
  return response
}

export const shouldUpdateDistro = (config: UpdateCloudFrontDistribution, distribution?: Distribution) => {
  const {
    staticBucketName,
    routingFunctionArn,
    splitCachePolicyId,
    addAdditionalBehaviour,
    longCachePolicyId,
    checkExpirationFunctionArn
  } = config

  const targetOriginId = distribution?.DistributionConfig?.DefaultCacheBehavior?.TargetOriginId

  if (staticBucketName && distribution?.DistributionConfig?.Origins && distribution.DistributionConfig.Origins.Items) {
    const mainOrigin = distribution.DistributionConfig.Origins.Items?.find((origin) => origin.Id === targetOriginId)

    if (mainOrigin && mainOrigin.DomainName !== staticBucketName) {
      return true
    }
  }

  if (addAdditionalBehaviour) {
    const _nextDataBehaviour = (distribution?.DistributionConfig?.CacheBehaviors?.Items || []).find(
      (b) => b.PathPattern === '/_next/data/*'
    )

    if (
      !_nextDataBehaviour ||
      (_nextDataBehaviour &&
        (_nextDataBehaviour.CachePolicyId !== splitCachePolicyId ||
          !_nextDataBehaviour.LambdaFunctionAssociations?.Items?.find(
            (item) => item.LambdaFunctionARN === routingFunctionArn
          )))
    ) {
      return true
    }

    const _nextBehaviour = (distribution?.DistributionConfig?.CacheBehaviors?.Items || []).find(
      (b) => b.PathPattern === '/_next/*'
    )

    if (!_nextBehaviour || _nextBehaviour.CachePolicyId !== longCachePolicyId) {
      return true
    }
  }

  const defBehavior = distribution?.DistributionConfig?.DefaultCacheBehavior
  const originReqLambdaFunc = defBehavior?.LambdaFunctionAssociations?.Items?.find(
    (item) => item.LambdaFunctionARN === routingFunctionArn
  )
  const originResLambdaFunc = defBehavior?.LambdaFunctionAssociations?.Items?.find(
    (item) => item.LambdaFunctionARN === checkExpirationFunctionArn
  )

  if (defBehavior?.CachePolicyId !== splitCachePolicyId || !originResLambdaFunc || !originReqLambdaFunc) {
    return true
  }

  return false
}

export const updateDistribution = async (
  cfClient: CloudFront,
  distribution: GetDistributionCommandOutput,
  config: UpdateCloudFrontDistribution
) => {
  const {
    staticBucketName,
    routingFunctionArn,
    splitCachePolicyId,
    addAdditionalBehaviour,
    longCachePolicyId,
    checkExpirationFunctionArn
  } = config
  const { Distribution, ETag } = distribution

  //shouldn't update distribution if nothing changed
  if (!shouldUpdateDistro(config, Distribution)) {
    return
  }

  if (Distribution && Distribution.DistributionConfig) {
    const targetOriginId = Distribution.DistributionConfig?.DefaultCacheBehavior?.TargetOriginId
    if (staticBucketName && Distribution.DistributionConfig.Origins && Distribution.DistributionConfig.Origins.Items) {
      const updatedOrigins = Distribution.DistributionConfig.Origins.Items?.map((origin) => {
        if (origin.Id === targetOriginId) {
          return {
            ...origin,
            DomainName: staticBucketName,
            CustomOriginConfig: undefined // Remove any custom origin settings
          }
        }
        return origin
      })

      // Update the Origins with the modified origin
      Distribution.DistributionConfig.Origins.Items = updatedOrigins
    }

    if (addAdditionalBehaviour) {
      const behaviours: CacheBehavior[] = [
        behaviorMapper({
          pathPattern: '/_next/data/*',
          targetOriginId,
          cachePolicyId: splitCachePolicyId!,
          functionArn: routingFunctionArn
        }),
        behaviorMapper({
          pathPattern: '/_next/*',
          targetOriginId,
          cachePolicyId: longCachePolicyId!
        })
      ]
      const updatedBehaviors = behaviours.map((behaviour) => {
        const oldBehavior = (Distribution.DistributionConfig?.CacheBehaviors?.Items || []).find(
          (b) => b.PathPattern === behaviour.PathPattern
        )
        if (oldBehavior) {
          return {
            ...oldBehavior,
            ...behaviour
          }
        }
        return behaviour
      })

      const mergedBehaviours = (Distribution.DistributionConfig?.CacheBehaviors?.Items || [])
        .filter((a) => !updatedBehaviors.find((b) => a.PathPattern === b.PathPattern))
        .concat(updatedBehaviors)

      Distribution.DistributionConfig.CacheBehaviors = {
        Items: mergedBehaviours,
        Quantity: mergedBehaviours.length
      }
    }

    const defBeh = Distribution.DistributionConfig.DefaultCacheBehavior

    Distribution.DistributionConfig.DefaultCacheBehavior = {
      ...defBeh,
      LambdaFunctionAssociations: {
        Quantity: 2,
        Items: [
          {
            EventType: LambdaEdgeEventType.ORIGIN_REQUEST,
            LambdaFunctionARN: routingFunctionArn
          },
          {
            EventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
            LambdaFunctionARN: checkExpirationFunctionArn
          }
        ]
      },
      TargetOriginId: targetOriginId,
      ViewerProtocolPolicy: 'allow-all',
      SmoothStreaming: false,
      Compress: true,
      CachePolicyId: splitCachePolicyId
    }
  }

  // Update the distribution with the modified config
  const updateParams = {
    Id: Distribution?.Id,
    IfMatch: ETag, // Required for updating the distribution
    DistributionConfig: Distribution?.DistributionConfig
  }
  const command = new UpdateDistributionCommand(updateParams)
  const updateResponse = await cfClient.send(command)

  return updateResponse
}
