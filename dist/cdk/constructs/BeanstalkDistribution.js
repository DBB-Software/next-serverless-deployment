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
exports.BeanstalkDistribution = void 0;
const constructs_1 = require("constructs");
const elasticbeanstalk = __importStar(require("aws-cdk-lib/aws-elasticbeanstalk"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cdk_1 = require("../../common/cdk");
const NodeJSEnvironmentMapping = {
    '18': '64bit Amazon Linux 2023 v6.1.7 running Node.js 18',
    '20': '64bit Amazon Linux 2023 v6.1.7 running Node.js 20'
};
class BeanstalkDistribution extends constructs_1.Construct {
    ebApp;
    ebEnv;
    ebS3;
    ebInstanceProfile;
    ebInstanceProfileRole;
    constructor(scope, id, props) {
        super(scope, id);
        const { stage, nodejs, isProduction, staticS3Bucket, region, appName } = props;
        this.ebApp = new elasticbeanstalk.CfnApplication(this, 'EbApp', {
            applicationName: `${id}-eb-app`
        });
        this.ebInstanceProfileRole = new iam.Role(this, 'EbInstanceProfileRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier')]
        });
        this.ebInstanceProfileRole.addToPolicy(new iam.PolicyStatement({
            actions: ['s3:Get*', 's3:Put*'],
            resources: [`${staticS3Bucket.bucketArn}/*`]
        }));
        this.ebInstanceProfile = new iam.CfnInstanceProfile(this, 'EbInstanceProfile', {
            roles: [this.ebInstanceProfileRole.roleName]
        });
        // Pass nodejs version to use for EB instance.
        // Uses nodejs 20 as a fallback.
        // Available platforms: https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.nodejs
        const nodeJSEnvironment = NodeJSEnvironmentMapping[nodejs ?? ''] ?? NodeJSEnvironmentMapping['20'];
        this.ebEnv = new elasticbeanstalk.CfnEnvironment(this, 'EbEnv', {
            environmentName: `${appName}-eb-env`,
            applicationName: this.ebApp.applicationName,
            solutionStackName: nodeJSEnvironment,
            optionSettings: [
                {
                    namespace: 'aws:elasticbeanstalk:application:environment',
                    optionName: 'NODE_ENV',
                    value: stage
                },
                {
                    namespace: 'aws:elasticbeanstalk:application:environment',
                    optionName: 'STATIC_BUCKET_NAME',
                    value: staticS3Bucket.bucketName
                },
                {
                    namespace: 'aws:elasticbeanstalk:application:environment',
                    optionName: 'AWS_REGION',
                    value: region
                },
                {
                    namespace: 'aws:elasticbeanstalk:environment',
                    optionName: 'LoadBalancerType',
                    value: 'application'
                },
                {
                    namespace: 'aws:autoscaling:launchconfiguration',
                    optionName: 'InstanceType',
                    value: 't2.micro'
                },
                {
                    namespace: 'aws:autoscaling:launchconfiguration',
                    optionName: 'IamInstanceProfile',
                    value: this.ebInstanceProfile.attrArn
                }
            ]
        });
        this.ebS3 = new s3.Bucket(this, 'EbVersions', {
            removalPolicy: isProduction ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            autoDeleteObjects: !isProduction
        });
        (0, cdk_1.addOutput)(this, `${appName}-BeanstalkDomain`, this.ebEnv.attrEndpointUrl);
        (0, cdk_1.addOutput)(this, `${appName}-BeanstalkApplicationName`, this.ebApp.applicationName);
        (0, cdk_1.addOutput)(this, `${appName}-BeanstalkEnvironmentName`, this.ebEnv.environmentName);
        (0, cdk_1.addOutput)(this, `${appName}-BeanstalkVersionsBucketName`, this.ebS3.bucketName);
    }
}
exports.BeanstalkDistribution = BeanstalkDistribution;
