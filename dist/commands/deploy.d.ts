export interface DeployConfig {
    siteName: string;
    stage?: string;
    nodejs?: string;
    isProduction?: boolean;
    aws: {
        region?: string;
        profile?: string;
    };
}
export interface DeployStackProps {
    region?: string;
    profile?: string;
    buildOutputPath: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
}
export declare const deploy: (config: DeployConfig) => Promise<void>;
