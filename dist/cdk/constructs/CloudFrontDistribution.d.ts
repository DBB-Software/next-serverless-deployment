import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CacheConfig } from '../../types';
interface CloudFrontPropsDistribution {
    staticBucket: s3.IBucket;
    ebAppDomain: string;
    requestEdgeFunction: cloudfront.experimental.EdgeFunction;
    responseEdgeFunction: cloudfront.experimental.EdgeFunction;
    cacheConfig: CacheConfig;
}
export declare class CloudFrontDistribution extends Construct {
    readonly cf: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: CloudFrontPropsDistribution);
}
export {};
