interface BootstrapProps {
    region?: string;
    profile?: string;
}
export declare const bootstrap: ({ region, profile }: BootstrapProps) => Promise<void>;
export {};
