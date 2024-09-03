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
exports.getCDKAssetsPublisher = exports.AWSClient = exports.emptyBucket = exports.listAllObjects = exports.uploadFolderToS3 = exports.uploadFileToS3 = exports.getFileContentType = exports.getSTSIdentity = exports.getAWSCredentials = exports.S3_KEYS_LIMIT = exports.AWS_EDGE_REGION = void 0;
const credential_providers_1 = require("@aws-sdk/credential-providers");
const client_sts_1 = require("@aws-sdk/client-sts");
const cdk_assets_1 = require("cdk-assets");
const AWS = __importStar(require("aws-sdk"));
const util_endpoints_1 = require("@aws-sdk/util-endpoints");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
exports.AWS_EDGE_REGION = 'us-east-1';
exports.S3_KEYS_LIMIT = 1000;
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
const getFileContentType = (filePath) => {
    if (!filePath)
        return;
    const extension = node_path_1.default.extname(filePath);
    switch (extension) {
        case '.css':
            return 'text/css';
        case '.js':
            return 'application/javascript';
        case '..html':
            return 'text/html';
        default:
            return 'application/octet-stream';
    }
};
exports.getFileContentType = getFileContentType;
const uploadFileToS3 = async (s3Client, options) => {
    return s3Client.putObject({
        ...options,
        ContentType: (0, exports.getFileContentType)(options.Key)
    });
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
const listAllObjects = async (s3Client, bucketName) => {
    const objects = [];
    let continuationToken;
    do {
        const { Contents: contents = [], NextContinuationToken: token } = await s3Client.listObjectsV2({
            Bucket: bucketName,
            ContinuationToken: continuationToken
        });
        objects.push(...contents);
        continuationToken = token;
    } while (continuationToken);
    return objects;
};
exports.listAllObjects = listAllObjects;
async function deleteObjects(s3Client, bucketName, items) {
    if (items?.length) {
        return s3Client.deleteObjects({
            Bucket: bucketName,
            Delete: {
                Objects: items.map((item) => ({ Key: item.Key })),
                Quiet: true
            }
        });
    }
}
const emptyBucket = async (s3Client, bucketName) => {
    const bucketItems = await (0, exports.listAllObjects)(s3Client, bucketName);
    if (bucketItems?.length) {
        const deletePromises = [];
        for (let i = 0; i < bucketItems.length; i += exports.S3_KEYS_LIMIT) {
            const itemsToDelete = bucketItems.slice(i, i + exports.S3_KEYS_LIMIT);
            deletePromises.push(deleteObjects(s3Client, bucketName, itemsToDelete));
        }
        await Promise.all(deletePromises);
    }
};
exports.emptyBucket = emptyBucket;
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
