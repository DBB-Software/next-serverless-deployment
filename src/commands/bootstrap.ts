import childProcess from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { getAWSCredentials, getSTSIdentity, AWS_EDGE_REGION } from '../common/aws'
import { getProjectSettings } from '../common/project'
import { OUTPUT_FOLDER } from '../build/next'
import { createConfigFile } from './helpers/createConfig'

interface BootstrapProps {
  region?: string
  profile?: string
}

const runTask = (command: string, env: Record<string, string | undefined>) => {
  const task = childProcess.spawn(command, {
    env: env,
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

const updateGitIgnore = (projectPath: string) => {
  const gitIgnorePath = path.join(projectPath, '.gitignore')
  const gitIgnore = fs.readFileSync(gitIgnorePath, 'utf8')
  if (!gitIgnore.includes(OUTPUT_FOLDER)) {
    fs.appendFileSync(gitIgnorePath, `\n#Next Serverless\n${OUTPUT_FOLDER}\n`)
  }
}

export const bootstrap = async ({ region, profile }: BootstrapProps) => {
  const awsRegion = region || process.env.AWS_REGION
  const identity = await getSTSIdentity({ region: awsRegion, profile })
  const credentials = await getAWSCredentials({ region: awsRegion, profile })

  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('AWS Credentials are required.')
  }

  if (!awsRegion) {
    throw new Error('AWS Region is required.')
  }

  const { root: rootPath } = getProjectSettings(process.cwd()) || {}

  if (rootPath) {
    updateGitIgnore(rootPath)
  }

  const taskEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_REGION: awsRegion,
    AWS_PROFILE: profile
  }

  // Creates a config file for the user
  createConfigFile()

  runTask(`npx cdk bootstrap aws://${identity.Account}/${awsRegion}`, taskEnv)

  // This is required to create AWS CDK resources for edge AWS region.
  if (awsRegion !== AWS_EDGE_REGION) {
    runTask(`npx cdk bootstrap aws://${identity.Account}/${AWS_EDGE_REGION}`, {
      ...taskEnv,
      AWS_REGION: AWS_EDGE_REGION
    })
  }
}
