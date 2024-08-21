import { S3, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { AssetPublishing, type IAws } from 'cdk-assets';
import * as AWS from 'aws-sdk';
type GetAWSBasicProps = {
    region?: string;
} | {
    region?: string;
    profile?: string;
} | void;
type S3UploadFolderOptions = PutObjectCommandInput & {
    folderRootPath: string;
    Key: string;
};
export declare const getAWSCredentials: (props: GetAWSBasicProps) => Promise<import("@smithy/types").AwsCredentialIdentity>;
export declare const getSTSIdentity: (props: GetAWSBasicProps) => Promise<import("@aws-sdk/client-sts").GetCallerIdentityCommandOutput>;
export declare const uploadFileToS3: (s3Client: S3, options: PutObjectCommandInput) => Promise<import("@aws-sdk/client-s3").PutObjectCommandOutput>;
export declare const uploadFolderToS3: (s3Client: S3, options: S3UploadFolderOptions) => Promise<void>;
export declare class AWSClient implements IAws {
    private readonly region?;
    private readonly profile?;
    constructor(region?: string, profile?: string);
    discoverDefaultRegion(): Promise<string>;
    discoverPartition(): Promise<string>;
    discoverCurrentAccount(): Promise<{
        accountId: string;
        partition: string;
    }>;
    discoverTargetAccount(): Promise<{
        accountId: string;
        partition: string;
    }>;
    s3Client(): Promise<AWS.S3>;
    ecrClient(): Promise<AWS.ECR>;
    secretsManagerClient(): Promise<AWS.SecretsManager>;
}
export declare const getCDKAssetsPublisher: (manifestPath: string, { region, profile }: {
    region?: string;
    profile?: string;
}) => AssetPublishing;
export {};
