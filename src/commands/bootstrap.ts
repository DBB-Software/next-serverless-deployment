import childProcess from 'node:child_process'
import { getAWSCredentials, getSTSIdentity } from '../utils/aws'

interface BootstrapProps {
  region?: string
  profile?: string
}

export const bootstrap = async ({ region, profile }: BootstrapProps) => {
  const identity = await getSTSIdentity({ region, profile })
  const credentials = await getAWSCredentials({ region, profile })

  const task = childProcess.spawn(`npx cdk bootstrap aws://${identity.Account}/${region}`, {
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      AWS_SESSION_TOKEN: credentials.sessionToken,
      AWS_REGION: region,
      AWS_PROFILE: profile
    },
    shell: true,
    stdio: 'pipe'
  })
  task.stdout.on('data', (data: Buffer) => {
    console.debug(data.toString())
  })
  task.stderr.on('data', (data: Buffer) => {
    console.debug(data.toString())
  })
  task.on('exit', (code) => {
    console.debug('Bootstrapping CDK exited with code', code)
  })
}
