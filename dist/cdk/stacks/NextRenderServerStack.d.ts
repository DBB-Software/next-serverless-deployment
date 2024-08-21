import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution';
export interface NextRenderServerStackProps extends cdk.StackProps {
    stage: string;
    nodejs?: string;
    isProduction?: boolean;
    region: string;
}
export declare class NextRenderServerStack extends cdk.Stack {
    readonly elasticbeanstalk: BeanstalkDistribution;
    readonly staticBucket: s3.Bucket;
    readonly staticBucketName: string;
    constructor(scope: Construct, id: string, props: NextRenderServerStackProps);
}
