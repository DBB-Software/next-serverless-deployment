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
exports.NextRenderServerStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const BeanstalkDistribution_1 = require("../constructs/BeanstalkDistribution");
const cdk_1 = require("../../common/cdk");
class NextRenderServerStack extends cdk.Stack {
    elasticbeanstalk;
    staticBucket;
    staticBucketName;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, nodejs, isProduction, region } = props;
        this.staticBucketName = `${id}-static`;
        this.staticBucket = new s3.Bucket(this, this.staticBucketName, {
            bucketName: this.staticBucketName,
            removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: !isProduction,
            publicReadAccess: true,
            blockPublicAccess: {
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false
            }
        });
        this.elasticbeanstalk = new BeanstalkDistribution_1.BeanstalkDistribution(this, `${id}-ElasticBeanstalkDistribution`, {
            stage,
            nodejs,
            isProduction,
            staticS3Bucket: this.staticBucket,
            region,
            appName: id
        });
        (0, cdk_1.addOutput)(this, `${id}-StaticBucketName`, this.staticBucket.bucketName);
    }
}
exports.NextRenderServerStack = NextRenderServerStack;
