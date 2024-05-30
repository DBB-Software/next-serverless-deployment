import { fromNodeProviderChain, fromEnv, fromIni } from '@aws-sdk/credential-providers'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { S3, PutObjectCommandInput } from '@aws-sdk/client-s3'
import { AssetManifest, AssetPublishing, type IAws } from 'cdk-assets'
import * as AWS from 'aws-sdk'
import { partition } from '@aws-sdk/util-endpoints'
import fs from 'node:fs'
import path from 'node:path'

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

export const getAWSCredentials = async (props: GetAWSBasicProps) => {
  const credentials = await fromNodeProviderChain({
    ...(props && 'profile' in props && props.profile ? await fromIni({ profile: props.profile }) : await fromEnv()),
    ...(props?.region && { clientConfig: { region: props.region } })
  })({})

  return credentials
}

export const getSTSIdentity = async (props: GetAWSBasicProps) => {
  const stsClient = new STSClient({
    credentials: await getAWSCredentials(props)
  })

  const identity = await stsClient.send(new GetCallerIdentityCommand({}))

  return identity
}

export const uploadFileToS3 = async (s3Client: S3, options: PutObjectCommandInput) => {
  return s3Client.putObject(options)
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
