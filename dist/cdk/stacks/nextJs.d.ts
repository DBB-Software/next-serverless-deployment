import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BeanstalkDistribution } from '../constructs/BeanstalkDistribution';
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution';
interface NextjsProps {
    stage: string;
    nodejs?: string;
    isProduction?: boolean;
}
export declare class Nextjs extends Stack {
    readonly elasticbeanstalk: BeanstalkDistribution;
    readonly cloudfront: CloudFrontDistribution;
    readonly staticBucket: s3.Bucket;
    readonly staticBucketName: string;
    constructor(scope: Construct, id: string, props: NextjsProps);
}
export {};
