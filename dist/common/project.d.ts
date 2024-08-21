export interface ProjectPackager {
    type: 'npm' | 'yarn' | 'pnpm';
    lockFile: 'package-lock.json' | 'yarn.lock' | 'pnpm-lock.yaml';
    buildCommand: string;
}
export interface ProjectSettings {
    root: string;
    packager: ProjectPackager;
    isMonorepo: boolean;
    projectPath: string;
    nextConfigPath: string;
}
export declare const findPackager: (appPath: string) => ProjectPackager | undefined;
export declare const findNextConfig: (appPath: string) => string | undefined;
export declare const getProjectSettings: (projectPath: string) => ProjectSettings | undefined;
