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
exports.getCDKAssetsPublisher = exports.AWSClient = exports.uploadFolderToS3 = exports.uploadFileToS3 = exports.getSTSIdentity = exports.getAWSCredentials = void 0;
const credential_providers_1 = require("@aws-sdk/credential-providers");
const client_sts_1 = require("@aws-sdk/client-sts");
const cdk_assets_1 = require("cdk-assets");
const AWS = __importStar(require("aws-sdk"));
const util_endpoints_1 = require("@aws-sdk/util-endpoints");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const getAWSCredentials = async (props) => {
    const credentials = await (0, credential_providers_1.fromNodeProviderChain)({
        ...(props && 'profile' in props && props.profile ? await (0, credential_providers_1.fromIni)({ profile: props.profile }) : await (0, credential_providers_1.fromEnv)()),
        ...(props?.region && { clientConfig: { region: props.region } })
    })({});
    return credentials;
};
exports.getAWSCredentials = getAWSCredentials;
const getSTSIdentity = async (props) => {
    const stsClient = new client_sts_1.STSClient({
        region: props?.region,
        credentials: await (0, exports.getAWSCredentials)(props)
    });
    const identity = await stsClient.send(new client_sts_1.GetCallerIdentityCommand({}));
    return identity;
};
exports.getSTSIdentity = getSTSIdentity;
const uploadFileToS3 = async (s3Client, options) => {
    return s3Client.putObject(options);
};
exports.uploadFileToS3 = uploadFileToS3;
const uploadFolderToS3 = async (s3Client, options) => {
    const { folderRootPath, Key, ...s3UploadOptions } = options;
    const files = node_fs_1.default.readdirSync(node_path_1.default.join(folderRootPath, Key));
    for (const file of files) {
        const filePath = node_path_1.default.join(folderRootPath, Key, file);
        const s3FilePath = node_path_1.default.join(Key, file);
        if (node_fs_1.default.lstatSync(filePath).isDirectory()) {
            await (0, exports.uploadFolderToS3)(s3Client, {
                ...s3UploadOptions,
                Key: s3FilePath,
                folderRootPath
            });
        }
        else {
            await (0, exports.uploadFileToS3)(s3Client, {
                ...s3UploadOptions,
                Key: s3FilePath,
                Body: node_fs_1.default.createReadStream(filePath)
            });
        }
    }
};
exports.uploadFolderToS3 = uploadFolderToS3;
class AWSClient {
    region;
    profile;
    constructor(region, profile) {
        this.region = region;
        this.profile = profile;
    }
    async discoverDefaultRegion() {
        return this.region ?? '';
    }
    async discoverPartition() {
        return (0, util_endpoints_1.partition)(this.region ?? '').name;
    }
    async discoverCurrentAccount() {
        const { Account } = await (0, exports.getSTSIdentity)({
            region: this.region,
            profile: this.profile
        });
        return {
            accountId: Account,
            partition: await this.discoverPartition()
        };
    }
    async discoverTargetAccount() {
        return this.discoverCurrentAccount();
    }
    async s3Client() {
        const creds = await (0, exports.getAWSCredentials)({
            region: this.region,
            profile: this.profile
        });
        return new AWS.S3({ region: this.region, credentials: creds });
    }
    async ecrClient() {
        const creds = await (0, exports.getAWSCredentials)({
            region: this.region,
            profile: this.profile
        });
        return new AWS.ECR({ region: this.region, credentials: creds });
    }
    async secretsManagerClient() {
        const creds = await (0, exports.getAWSCredentials)({
            region: this.region,
            profile: this.profile
        });
        return new AWS.SecretsManager({ region: this.region, credentials: creds });
    }
}
exports.AWSClient = AWSClient;
const getCDKAssetsPublisher = (manifestPath, { region, profile }) => {
    return new cdk_assets_1.AssetPublishing(cdk_assets_1.AssetManifest.fromFile(manifestPath), { aws: new AWSClient(region, profile) });
};
exports.getCDKAssetsPublisher = getCDKAssetsPublisher;
