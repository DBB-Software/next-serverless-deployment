import { type ProjectSettings } from '../common/project';
interface BuildAppOptions {
    outputPath: string;
    s3BucketName: string;
    projectSettings: ProjectSettings;
}
export declare const buildApp: (options: BuildAppOptions) => Promise<() => void>;
export {};
