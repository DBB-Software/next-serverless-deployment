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
exports.CheckExpirationLambdaEdge = void 0;
const constructs_1 = require("constructs");
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const node_path_1 = __importDefault(require("node:path"));
const edge_1 = require("../../build/edge");
const NodeJSEnvironmentMapping = {
    '18': lambda.Runtime.NODEJS_18_X,
    '20': lambda.Runtime.NODEJS_20_X
};
class CheckExpirationLambdaEdge extends constructs_1.Construct {
    lambdaEdge;
    constructor(scope, id, props) {
        const { bucketName, bucketRegion, ebAppDomain, nodejs, buildOutputPath, cacheConfig } = props;
        super(scope, id);
        const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20'];
        const name = 'checkExpiration';
        (0, edge_1.buildLambda)(name, buildOutputPath, {
            define: {
                'process.env.S3_BUCKET': JSON.stringify(bucketName),
                'process.env.S3_BUCKET_REGION': JSON.stringify(bucketRegion ?? ''),
                'process.env.EB_APP_URL': JSON.stringify(ebAppDomain),
                'process.env.CACHE_CONFIG': JSON.stringify(cacheConfig)
            }
        });
        const logGroup = new logs.LogGroup(this, 'CheckExpirationLambdaEdgeLogGroup', {
            logGroupName: `/aws/lambda/${id}-checkExpiration`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: logs.RetentionDays.ONE_DAY
        });
        this.lambdaEdge = new cloudfront.experimental.EdgeFunction(this, 'CheckExpirationLambdaEdge', {
            runtime: nodeJSEnvironment,
            code: lambda.Code.fromAsset(node_path_1.default.join(buildOutputPath, 'server-functions', name)),
            handler: 'index.handler',
            logGroup
        });
        logGroup.grantWrite(this.lambdaEdge);
        const policyStatement = new iam.PolicyStatement({
            actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 's3:GetObject'],
            resources: [`${logGroup.logGroupArn}:*`, `arn:aws:s3:::${bucketName}/*`]
        });
        this.lambdaEdge.addToRolePolicy(policyStatement);
    }
}
exports.CheckExpirationLambdaEdge = CheckExpirationLambdaEdge;
