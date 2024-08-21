"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploy = void 0;
const client_elastic_beanstalk_1 = require("@aws-sdk/client-elastic-beanstalk");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_cloudfront_1 = require("@aws-sdk/client-cloudfront");
const node_fs_1 = __importDefault(require("node:fs"));
const node_child_process_1 = __importDefault(require("node:child_process"));
const node_path_1 = __importDefault(require("node:path"));
const next_1 = require("../build/next");
const NextRenderServerStack_1 = require("../cdk/stacks/NextRenderServerStack");
const NextCloudfrontStack_1 = require("../cdk/stacks/NextCloudfrontStack");
const aws_1 = require("../common/aws");
const cdk_1 = require("../common/cdk");
const project_1 = require("../common/project");
const loadConfig_1 = __importDefault(require("./helpers/loadConfig"));
const cleanOutputFolder = () => {
    const outputFolderPath = node_path_1.default.join(process.cwd(), next_1.OUTPUT_FOLDER);
    node_fs_1.default.rmSync(outputFolderPath, { recursive: true, force: true });
};
const createOutputFolder = () => {
    const outputFolderPath = node_path_1.default.join(process.cwd(), next_1.OUTPUT_FOLDER);
    // clean folder before creating new build output.
    cleanOutputFolder();
    node_fs_1.default.mkdirSync(outputFolderPath);
    return outputFolderPath;
};
const deploy = async (config) => {
    let cleanNextApp;
    try {
        const { siteName, stage = 'development', aws } = config;
        const credentials = await (0, aws_1.getAWSCredentials)({ region: config.aws.region, profile: config.aws.profile });
        const region = aws.region || process.env.REGION;
        if (!credentials.accessKeyId || !credentials.secretAccessKey) {
            throw new Error('AWS Credentials are required.');
        }
        if (!region) {
            throw new Error('AWS Region is required.');
        }
        const projectSettings = (0, project_1.getProjectSettings)(process.cwd());
        if (!projectSettings) {
            throw new Error('Was not able to find project settings.');
        }
        const cacheConfig = await (0, loadConfig_1.default)();
        const outputPath = createOutputFolder();
        const clientAWSCredentials = {
            region,
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken
            }
        };
        const ebClient = new client_elastic_beanstalk_1.ElasticBeanstalk(clientAWSCredentials);
        const s3Client = new client_s3_1.S3(clientAWSCredentials);
        const cloudfrontClient = new client_cloudfront_1.CloudFront(clientAWSCredentials);
        // .toLowerCase() is required, since AWS has limitation for resources names
        // that name must contain only lowercase characters.
        if (/[A-Z]/.test(siteName)) {
            console.warn('SiteName should not contain uppercase characters. Updating value to contain only lowercase characters.');
        }
        const siteNameLowerCased = siteName.toLowerCase();
        const nextRenderServerStack = new cdk_1.AppStack(`${siteNameLowerCased}-server`, NextRenderServerStack_1.NextRenderServerStack, {
            ...clientAWSCredentials,
            buildOutputPath: outputPath,
            profile: config.aws.profile,
            stage,
            nodejs: config.nodejs,
            isProduction: config.isProduction,
            crossRegionReferences: true,
            region,
            env: {
                region
            }
        });
        const nextRenderServerStackOutput = await nextRenderServerStack.deployStack();
        const nextCloudfrontStack = new cdk_1.AppStack(`${siteNameLowerCased}-cf`, NextCloudfrontStack_1.NextCloudfrontStack, {
            ...clientAWSCredentials,
            profile: config.aws.profile,
            nodejs: config.nodejs,
            staticBucketName: nextRenderServerStackOutput.StaticBucketName,
            ebAppDomain: nextRenderServerStackOutput.BeanstalkDomain,
            buildOutputPath: outputPath,
            crossRegionReferences: true,
            region,
            cacheConfig,
            env: {
                region: aws_1.AWS_EDGE_REGION // required since Edge can be deployed only here.
            }
        });
        const nextCloudfrontStackOutput = await nextCloudfrontStack.deployStack();
        // Build and zip app.
        cleanNextApp = await (0, next_1.buildApp)({
            projectSettings,
            outputPath,
            s3BucketName: nextRenderServerStackOutput.StaticBucketName
        });
        const now = Date.now();
        const archivedFolderName = `${next_1.OUTPUT_FOLDER}-server-v${now}.zip`;
        const buildOutputPathArchived = node_path_1.default.join(outputPath, archivedFolderName);
        const versionLabel = `${next_1.OUTPUT_FOLDER}-server-v${now}`;
        node_fs_1.default.writeFileSync(node_path_1.default.join(outputPath, 'server', 'Procfile'), `web: node ${node_path_1.default.join(node_path_1.default.relative(projectSettings.root, projectSettings.projectPath), 'server.js')}`);
        node_child_process_1.default.execSync(`cd ${node_path_1.default.join(outputPath, 'server')} && zip -r ../${archivedFolderName} \\.* *`, {
            stdio: 'inherit'
        });
        // prune static bucket before upload
        await (0, aws_1.emptyBucket)(s3Client, nextRenderServerStackOutput.StaticBucketName);
        await (0, aws_1.uploadFolderToS3)(s3Client, {
            Bucket: nextRenderServerStackOutput.StaticBucketName,
            Key: '_next',
            folderRootPath: outputPath
        });
        // upload code version to bucket.
        await (0, aws_1.uploadFileToS3)(s3Client, {
            Bucket: nextRenderServerStackOutput.BeanstalkVersionsBucketName,
            Key: `${versionLabel}.zip`,
            Body: node_fs_1.default.readFileSync(buildOutputPathArchived)
        });
        await ebClient.createApplicationVersion({
            ApplicationName: nextRenderServerStackOutput.BeanstalkApplicationName,
            VersionLabel: versionLabel,
            SourceBundle: {
                S3Bucket: nextRenderServerStackOutput.BeanstalkVersionsBucketName,
                S3Key: `${versionLabel}.zip`
            }
        });
        await ebClient.updateEnvironment({
            ApplicationName: nextRenderServerStackOutput.BeanstalkApplicationName,
            EnvironmentName: nextRenderServerStackOutput.BeanstalkEnvironmentName,
            VersionLabel: versionLabel
        });
        await cloudfrontClient.createInvalidation({
            DistributionId: nextCloudfrontStackOutput.CloudfrontDistributionId,
            InvalidationBatch: {
                CallerReference: `deploy-cache-invalidation-${now}`,
                Paths: {
                    Quantity: 1,
                    Items: ['/*']
                }
            }
        });
    }
    catch (err) {
        console.error('Failed to deploy:', err);
    }
    finally {
        cleanOutputFolder();
        cleanNextApp?.();
    }
};
exports.deploy = deploy;
