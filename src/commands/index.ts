#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { deploy } from './deploy'
import { bootstrap } from './bootstrap'
import { createApp } from './createApp'

interface CLIOptions {
  siteName: string
  stage?: string
  region?: string
  profile?: string
  nodejs?: string
  production?: boolean
  renderServerInstanceType?: string
  renderServerMinInstances?: number
  renderServerMaxInstances?: number
}

const cli = yargs(hideBin(process.argv))
  .scriptName('@dbbs-next')
  .usage('$0 <command> [options]')
  .option('region', {
    type: 'string'
  })
  .option('profile', {
    type: 'string'
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

cli
  .command<CLIOptions>(
    'createApp',
    'creates application stack',
    () => {},
    async (argv) => {
      const {
        profile,
        region,
        siteName,
        nodejs,
        production,
        renderServerInstanceType,
        renderServerMinInstances,
        renderServerMaxInstances
      } = argv

      await createApp({
        profile,
        region,
        siteName,
        nodejs,
        isProduction: production,
        renderServerInstanceType,
        renderServerMinInstances,
        renderServerMaxInstances
      })
    }
  )
  .option('siteName', {
    type: 'string',
    requiresArg: true,
    describe: 'The name is used to create CDK stack and components.'
  })
  .option('stage', {
    type: 'string',
    describe: 'The stage of the app, defaults to production'
  })
  .option('nodejs', {
    type: 'string'
  })
  .option('production', {
    type: 'boolean',
    description: 'Creates production stack.',
    default: false
  })
  .option('renderServerInstanceType', {
    type: 'string',
    describe: 'Set instance type for render server. Default is t2.micro.'
  })
  .option('renderServerMinInstances', {
    type: 'number',
    describe: 'Set min render server instances. Default is 1.'
  })
  .option('renderServerMaxInstances', {
    type: 'number',
    describe: 'Set max render server instances. Default is 2.'
  })

cli
  .command<CLIOptions>(
    'deploy',
    'app deployment',
    () => {},
    async (argv) => {
      const { siteName, stage, region, profile } = argv

      await deploy({
        siteName,
        stage,
        aws: {
          region,
          profile
        }
      })
    }
  )
  .option('siteName', {
    type: 'string',
    requiresArg: true,
    describe: 'The name is used to create CDK stack and components.'
  })
  .option('stage', {
    type: 'string',
    describe: 'The stage of the app, defaults to production'
  })

cli.help()
cli.parse()
