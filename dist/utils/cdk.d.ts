import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export declare const addOutput: (scope: Construct, exportName: string, value: string) => cdk.CfnOutput;
interface AppStackConstructorWithArgs<T, A> {
    new (app: cdk.App, stackName: string, options: A): T;
}
interface AppStackOptions extends cdk.StackProps {
    pruneBeforeDeploy?: boolean;
    buildOutputPath: string;
    region?: string;
    profile?: string;
    stage?: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
}
export declare class AppStack<T extends cdk.Stack, U> {
    readonly stack: T;
    readonly stackApp: cdk.App;
    private readonly cfClient;
    private readonly options;
    readonly stackName: string;
    readonly stackTemplate: string;
    constructor(stackName: string, Stack: AppStackConstructorWithArgs<T, U>, options: U & AppStackOptions);
    static CLOUDFORMATION_STACK_WAIT_TIME_SEC: number;
    describeCurrentStack: () => Promise<import("@aws-sdk/client-cloudformation").Stack | undefined>;
    getCurrentStackTemplate: () => Promise<string>;
    checkIfStackExists: () => Promise<boolean>;
    createStack: () => Promise<void>;
    updateStack: () => Promise<void>;
    destroyStack: () => Promise<void>;
    deployStack: () => Promise<Record<string, string>>;
}
export {};
