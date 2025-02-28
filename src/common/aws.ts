import { fromNodeProviderChain, fromEnv, fromIni } from '@aws-sdk/credential-providers'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { S3, PutObjectCommandInput, ListObjectsV2Output } from '@aws-sdk/client-s3'
import { AssetManifest, AssetPublishing, type IAws } from 'cdk-assets'
import * as AWS from 'aws-sdk'
import { partition } from '@aws-sdk/util-endpoints'
import fs from 'node:fs'
import path from 'node:path'
import mime from 'mime-types'

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

  return mime.lookup(filePath) || 'application/octet-stream'
}

export const uploadFileToS3 = async (s3Client: S3, options: PutObjectCommandInput) => {
  return s3Client.putObject({
    ...options,
    ContentType: getFileContentType(options.Key)
  })
}

export const uploadFolderToS3 = async (s3Client: S3, options: S3UploadFolderOptions) => {
  const { folderRootPath, Key, ...s3UploadOptions } = options
  const files = fs.readdirSync(folderRootPath)

  for (const file of files) {
    const filePath = path.join(folderRootPath, file)
    const s3FilePath = path.join(Key, file)

    if (fs.lstatSync(filePath).isDirectory()) {
      await uploadFolderToS3(s3Client, {
        ...s3UploadOptions,
        Key: s3FilePath,
        folderRootPath: filePath
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
