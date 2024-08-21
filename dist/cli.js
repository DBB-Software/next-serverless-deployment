#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const deploy_1 = require("./commands/deploy");
const bootstrap_1 = require("./commands/bootstrap");
const cli = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
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
});
cli.command('bootstrap', 'bootsrap CDK project', () => { }, async (argv) => {
    const { profile, region } = argv;
    await (0, bootstrap_1.bootstrap)({ profile, region });
});
cli.command('deploy', 'app deployment', () => { }, async (argv) => {
    const { siteName, pruneBeforeDeploy, stage, region, profile, nodejs, production } = argv;
    await (0, deploy_1.deploy)({
        siteName,
        stage,
        pruneBeforeDeploy,
        nodejs,
        isProduction: production,
        aws: {
            region,
            profile
        }
    });
});
cli.parse();
