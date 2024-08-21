import { CacheConfig } from '../../types';
export declare const findConfig: (configPath: string) => string | undefined;
declare function loadConfig(): Promise<CacheConfig>;
export default loadConfig;
