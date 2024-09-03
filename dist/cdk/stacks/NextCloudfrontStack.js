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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextCloudfrontStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const RoutingLambdaEdge_1 = require("../constructs/RoutingLambdaEdge");
const CloudFrontDistribution_1 = require("../constructs/CloudFrontDistribution");
const CheckExpirationLambdaEdge_1 = require("../constructs/CheckExpirationLambdaEdge");
class NextCloudfrontStack extends aws_cdk_lib_1.Stack {
    routingLambdaEdge;
    checkExpLambdaEdge;
    cloudfront;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { nodejs, buildOutputPath, staticBucketName, ebAppDomain, region, cacheConfig } = props;
        this.routingLambdaEdge = new RoutingLambdaEdge_1.RoutingLambdaEdge(this, `${id}-RoutingLambdaEdge`, {
            nodejs,
            bucketName: staticBucketName,
            ebAppDomain,
            buildOutputPath,
            cacheConfig,
            bucketRegion: region
        });
        this.checkExpLambdaEdge = new CheckExpirationLambdaEdge_1.CheckExpirationLambdaEdge(this, `${id}-CheckExpirationLambdaEdge`, {
            nodejs,
            bucketName: staticBucketName,
            ebAppDomain,
            buildOutputPath,
            cacheConfig,
            bucketRegion: region
        });
        const staticBucket = s3.Bucket.fromBucketAttributes(this, `${id}-StaticAssetsBucket`, {
            bucketName: staticBucketName,
            region
        });
        this.cloudfront = new CloudFrontDistribution_1.CloudFrontDistribution(this, `${id}-NextCloudFront`, {
            staticBucket,
            ebAppDomain,
            requestEdgeFunction: this.routingLambdaEdge.lambdaEdge,
            responseEdgeFunction: this.checkExpLambdaEdge.lambdaEdge,
            cacheConfig
        });
        staticBucket.grantRead(this.routingLambdaEdge.lambdaEdge);
        staticBucket.grantRead(this.checkExpLambdaEdge.lambdaEdge);
    }
}
exports.NextCloudfrontStack = NextCloudfrontStack;
