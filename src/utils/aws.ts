import { fromNodeProviderChain, fromEnv, fromIni } from '@aws-sdk/credential-providers'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'

type GetAWSBasicProps =
  | {
      region?: string
    }
  | {
      region?: string
      profile?: string
    }
  | void

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
