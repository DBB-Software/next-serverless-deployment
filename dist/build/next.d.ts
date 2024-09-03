import { type ProjectPackager, type ProjectSettings } from '../common/project';
interface BuildOptions {
    packager: ProjectPackager;
    nextConfigPath: string;
    s3BucketName: string;
}
interface BuildAppOptions {
    outputPath: string;
    s3BucketName: string;
    projectSettings: ProjectSettings;
}
export declare const OUTPUT_FOLDER = "serverless-next";
export declare const buildNext: (options: BuildOptions) => Promise<() => void>;
export declare const buildApp: (options: BuildAppOptions) => Promise<() => void>;
export {};
