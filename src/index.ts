#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { deploy } from './commands/deploy'
import { buildApp } from './commands/build'
import { bootstrap } from './commands/bootstrap'

interface CLIOptions {
  siteName: string
  stage?: string
  pruneBeforeDeploy?: boolean
  region?: string
  profile?: string
  nodejs?: string
  production?: boolean
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
  .option('region', {
    type: 'string'
  })
  .option('profile', {
    type: 'string'
  })
  .option('nodejs', {
    type: 'string'
  })
  .option('production', {
    type: 'boolean',
    description: 'Creates production stack.',
    default: false
  })

cli.command<CLIOptions>(
  'bootstrap',
  'bootsrap CDK project',
  () => {},
  async (argv) => {
    const { profile, region } = argv
    await bootstrap({ profile, region })
  }
)

cli.command<CLIOptions>(
  'deploy',
  'app deployment',
  () => {},
  async (argv) => {
    const { siteName, pruneBeforeDeploy, stage, region, profile, nodejs, production } = argv

    await deploy({
      siteName,
      stage,
      pruneBeforeDeploy,
      nodejs,
      isProduction: production,
      aws: {
        region,
        profile
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
