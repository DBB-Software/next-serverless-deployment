import { Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RoutingLambdaEdge } from '../constructs/RoutingLambdaEdge';
import { CloudFrontDistribution } from '../constructs/CloudFrontDistribution';
import { CacheConfig } from '../../types';
import { CheckExpirationLambdaEdge } from '../constructs/CheckExpirationLambdaEdge';
export interface NextCloudfrontStackProps extends StackProps {
    nodejs?: string;
    region?: string;
    staticBucketName: string;
    ebAppDomain: string;
    buildOutputPath: string;
    cacheConfig: CacheConfig;
}
export declare class NextCloudfrontStack extends Stack {
    readonly routingLambdaEdge: RoutingLambdaEdge;
    readonly checkExpLambdaEdge: CheckExpirationLambdaEdge;
    readonly cloudfront: CloudFrontDistribution;
    constructor(scope: Construct, id: string, props: NextCloudfrontStackProps);
}
