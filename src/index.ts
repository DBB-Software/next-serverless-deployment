#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { deploy } from './commands/deploy'
import { buildApp } from './commands/build'

interface CLIOptions {
  siteName: string
  stage?: string
  pruneBeforeDeploy?: boolean
  region?: string
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
}

const cli = yargs(hideBin(process.argv))
  .scriptName('@dbbs-next')
  .usage('$0 <command> [options]')
  .example('$0 deploy --siteName MySite --stage staging --pruneBeforeDeployment', 'Deploy the app.')
  .option('siteName', {
    type: 'string',
    requiresArg: true,
    describe: 'The name is used to create CDK stack and components.'
  })
  .option('stage', {
    type: 'string',
    describe: 'The stage of the app, defaults to production'
  })
  .option('pruneBeforeDeploy', {
    type: 'boolean',
    description: 'Clear CDK stack before deployment.',
    default: false
  })
  .option('awsAccessKeyId', {
    type: 'string'
  })
  .option('awsSecretAccessKey', {
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
    const { siteName, pruneBeforeDeploy, stage, awsAccessKeyId, awsSecretAccessKey, region } = argv

    await deploy({
      siteName,
      stage,
      pruneBeforeDeploy,
      aws: {
        region,
        awsAccessKeyId,
        awsSecretAccessKey
      }
    })
  }
)

cli.command(
  'build',
  'build the app',
  () => {},
  () => {
    buildApp()
  }
)

cli.parse()
