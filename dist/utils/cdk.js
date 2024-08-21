"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppStack = exports.addOutput = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
const node_path_1 = __importDefault(require("node:path"));
const aws_1 = require("../utils/aws");
const addOutput = (scope, exportName, value) => {
    return new cdk.CfnOutput(scope, exportName, {
        value,
        exportName
    });
};
exports.addOutput = addOutput;
class AppStack {
    stack;
    stackApp;
    cfClient;
    options;
    stackName;
    stackTemplate;
    constructor(stackName, Stack, options) {
        this.stackName = `${options.stage ? `${options.stage}-` : ''}${stackName}`;
        this.stackApp = new cdk.App({
            outdir: options.buildOutputPath
        });
        this.cfClient = new client_cloudformation_1.CloudFormationClient({
            region: options.env?.region || options.region,
            credentials: options.credentials
        });
        console.log('HERE_IS_CF_OPTIONS', {
            region: options.env?.region || options.region,
            credentials: options.credentials
        });
        this.stack = new Stack(this.stackApp, this.stackName, options);
        this.options = options;
        this.stackTemplate = this.stackApp.synth().getStackByName(this.stackName).template;
    }
    static CLOUDFORMATION_STACK_WAIT_TIME_SEC = 30 * 60; // 30 minutes
    describeCurrentStack = async () => {
        const command = new client_cloudformation_1.DescribeStacksCommand({ StackName: this.stackName });
        return this.cfClient.send(command).then((r) => r?.Stacks?.[0]);
    };
    getCurrentStackTemplate = async () => {
        const command = new client_cloudformation_1.GetTemplateCommand({ StackName: this.stackName });
        const response = await this.cfClient.send(command);
        return response.TemplateBody || '';
    };
    checkIfStackExists = async () => {
        try {
            const res = await this.describeCurrentStack();
            return !!res;
        }
        catch (err) {
            if (err instanceof client_cloudformation_1.CloudFormationServiceException) {
                if (err.name === 'ValidationError') {
                    return false;
                }
            }
            throw err;
        }
    };
    createStack = async () => {
        const command = new client_cloudformation_1.CreateStackCommand({
            StackName: this.stackName,
            TemplateBody: JSON.stringify(this.stackTemplate),
            Capabilities: ['CAPABILITY_IAM']
        });
        await this.cfClient.send(command);
        await (0, client_cloudformation_1.waitUntilStackCreateComplete)({ client: this.cfClient, maxWaitTime: AppStack.CLOUDFORMATION_STACK_WAIT_TIME_SEC }, { StackName: this.stackName });
    };
    updateStack = async () => {
        const command = new client_cloudformation_1.UpdateStackCommand({
            StackName: this.stackName,
            TemplateBody: JSON.stringify(this.stackTemplate),
            Capabilities: ['CAPABILITY_IAM']
        });
        await this.cfClient.send(command);
        await (0, client_cloudformation_1.waitUntilStackUpdateComplete)({ client: this.cfClient, maxWaitTime: AppStack.CLOUDFORMATION_STACK_WAIT_TIME_SEC }, { StackName: this.stackName });
    };
    destroyStack = async () => {
        const command = new client_cloudformation_1.DeleteStackCommand({
            StackName: this.stackName
        });
        await this.cfClient.send(command);
        await (0, client_cloudformation_1.waitUntilStackDeleteComplete)({ client: this.cfClient, maxWaitTime: AppStack.CLOUDFORMATION_STACK_WAIT_TIME_SEC }, { StackName: this.stackName });
    };
    deployStack = async () => {
        const { pruneBeforeDeploy, buildOutputPath, region, profile } = this.options;
        const assetsPublisher = (0, aws_1.getCDKAssetsPublisher)(node_path_1.default.join(buildOutputPath, `${this.stackName}.assets.json`), {
            region: region,
            profile: profile
        });
        await assetsPublisher.publish();
        const ifStackExists = await this.checkIfStackExists();
        if (ifStackExists && pruneBeforeDeploy) {
            await this.destroyStack();
        }
        if (!ifStackExists || (ifStackExists && pruneBeforeDeploy)) {
            await this.createStack();
        }
        if (ifStackExists && !pruneBeforeDeploy) {
            const currentTemplate = await this.getCurrentStackTemplate();
            if (currentTemplate !== JSON.stringify(this.stackTemplate)) {
                await this.updateStack();
            }
        }
        const currentStackInfo = await this.describeCurrentStack();
        return (currentStackInfo?.Outputs ?? []).reduce((prev, curr) => {
            return {
                ...prev,
                [curr.ExportName]: curr.OutputValue
            };
        }, {});
    };
}
exports.AppStack = AppStack;
