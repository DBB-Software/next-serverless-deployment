"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = void 0;
const node_child_process_1 = __importDefault(require("node:child_process"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const aws_1 = require("../common/aws");
const project_1 = require("../common/project");
const next_1 = require("../build/next");
const createConfig_1 = require("./helpers/createConfig");
const runTask = (command, env) => {
    const task = node_child_process_1.default.spawn(command, {
        env: env,
        shell: true,
        stdio: 'pipe'
    });
    task.stdout.on('data', (data) => {
        console.debug(data.toString());
    });
    task.stderr.on('data', (data) => {
        console.debug(data.toString());
    });
    task.on('exit', (code) => {
        console.debug('Bootstrapping CDK exited with code', code);
    });
};
const updateGitIgnore = (projectPath) => {
    const gitIgnorePath = node_path_1.default.join(projectPath, '.gitignore');
    const gitIgnore = node_fs_1.default.readFileSync(gitIgnorePath, 'utf8');
    if (!gitIgnore.includes(next_1.OUTPUT_FOLDER)) {
        node_fs_1.default.appendFileSync(gitIgnorePath, `\n#Next Serverless\n${next_1.OUTPUT_FOLDER}\n`);
    }
};
const bootstrap = async ({ region, profile }) => {
    const awsRegion = region || process.env.AWS_REGION;
    const identity = await (0, aws_1.getSTSIdentity)({ region: awsRegion, profile });
    const credentials = await (0, aws_1.getAWSCredentials)({ region: awsRegion, profile });
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        throw new Error('AWS Credentials are required.');
    }
    if (!awsRegion) {
        throw new Error('AWS Region is required.');
    }
    const { root: rootPath } = (0, project_1.getProjectSettings)(process.cwd()) || {};
    if (rootPath) {
        updateGitIgnore(rootPath);
    }
    const taskEnv = {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
        AWS_SESSION_TOKEN: credentials.sessionToken,
        AWS_REGION: awsRegion,
        AWS_PROFILE: profile
    };
    // Creates a config file for the user
    (0, createConfig_1.createConfigFile)();
    runTask(`npx cdk bootstrap aws://${identity.Account}/${awsRegion}`, taskEnv);
    // This is required to create AWS CDK resources for edge AWS region.
    if (awsRegion !== aws_1.AWS_EDGE_REGION) {
        runTask(`npx cdk bootstrap aws://${identity.Account}/${aws_1.AWS_EDGE_REGION}`, {
            ...taskEnv,
            AWS_REGION: aws_1.AWS_EDGE_REGION
        });
    }
};
exports.bootstrap = bootstrap;
