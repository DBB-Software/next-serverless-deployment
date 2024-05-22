import { fromNodeProviderChain, fromEnv, fromIni } from '@aws-sdk/credential-providers'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { S3, PutObjectCommandInput } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'path'

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
  await s3Client.putObject(options)
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
