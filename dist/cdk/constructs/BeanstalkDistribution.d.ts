import { Construct } from 'constructs';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
interface BeanstalkDistributionProps {
    stage: string;
    nodejs?: string;
    isProduction?: boolean;
    staticS3Bucket: s3.Bucket;
    region: string;
    appName: string;
}
export declare class BeanstalkDistribution extends Construct {
    readonly ebApp: elasticbeanstalk.CfnApplication;
    readonly ebEnv: elasticbeanstalk.CfnEnvironment;
    readonly ebS3: s3.Bucket;
    readonly ebInstanceProfile: iam.CfnInstanceProfile;
    readonly ebInstanceProfileRole: iam.Role;
    constructor(scope: Construct, id: string, props: BeanstalkDistributionProps);
}
export {};
