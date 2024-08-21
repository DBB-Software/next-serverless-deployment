import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { CacheConfig } from '../../types';
interface RoutingLambdaEdgeProps extends cdk.StackProps {
    bucketName: string;
    ebAppDomain: string;
    buildOutputPath: string;
    nodejs?: string;
    cacheConfig: CacheConfig;
    bucketRegion?: string;
}
export declare class RoutingLambdaEdge extends Construct {
    readonly lambdaEdge: cloudfront.experimental.EdgeFunction;
    constructor(scope: Construct, id: string, props: RoutingLambdaEdgeProps);
}
export {};
