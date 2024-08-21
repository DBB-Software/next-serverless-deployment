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
exports.Nextjs = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const BeanstalkDistribution_1 = require("../constructs/BeanstalkDistribution");
const CloudFrontDistribution_1 = require("../constructs/CloudFrontDistribution");
class Nextjs extends aws_cdk_lib_1.Stack {
    elasticbeanstalk;
    cloudfront;
    staticBucket;
    staticBucketName;
    constructor(scope, id, props) {
        super(scope, id);
        const { stage, nodejs, isProduction } = props;
        const appName = `${id}-${stage}`;
        this.staticBucketName = `${appName}-static`;
        this.staticBucket = new s3.Bucket(this, this.staticBucketName, {
            removalPolicy: isProduction ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            bucketName: this.staticBucketName,
            publicReadAccess: true
        });
        this.elasticbeanstalk = new BeanstalkDistribution_1.BeanstalkDistribution(this, `${id}ElasticBeanstalk`, {
            appName,
            stage,
            nodejs,
            isProduction
        });
        this.cloudfront = new CloudFrontDistribution_1.CloudFrontDistribution(this, `${id}CloudFront`, {
            staticBucket: this.staticBucket,
            ebEnv: this.elasticbeanstalk.ebEnv
        });
    }
}
exports.Nextjs = Nextjs;
