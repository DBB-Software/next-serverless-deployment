#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { deploy } from './commands/deploy'

interface CLIOptions {
  siteName: string
  stage?: string
  pruneBeforeDeploy?: boolean
  region?: string
  aws_access_key_id?: string
  aws_secret_access_key?: string
}

const cli = yargs(hideBin(process.argv))
  .scriptName('@dbbs-next')
  .usage('$0 <command> [options]')
  .example('$0 deploy --siteName MySite --stage staging --pruneBeforeDeployment', 'Deploys the app.')
  .option('siteName', {
    type: 'string',
    requiresArg: true,
    describe: 'The name used to created CDK stack and components.'
  })
  .option('stage', {
    type: 'string',
    describe: 'The stage of your app, defaults to production'
  })
  .option('pruneBeforeDeploy', {
    type: 'boolean',
    description: 'Clear CDK stack before deployment.',
    default: false
  })
  .option('aws_access_key_id', {
    type: 'string'
  })
  .option('aws_secret_access_key', {
    type: 'string'
  })
  .option('region', {
    type: 'string'
  })

cli.command<CLIOptions>(
  'deploy',
  'app deployment',
  () => {},
  async (argv) => {
    const { siteName, pruneBeforeDeploy, stage, aws_access_key_id, aws_secret_access_key, region } = argv

    await deploy({
      siteName,
      stage,
      pruneBeforeDeploy,
      aws: {
        region,
        aws_access_key_id,
        aws_secret_access_key
      }
    })
  }
)

cli.parse()
