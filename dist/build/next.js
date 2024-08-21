"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = exports.buildNext = exports.OUTPUT_FOLDER = void 0;
const node_child_process_1 = __importDefault(require("node:child_process"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const loadConfig_1 = __importDefault(require("../commands/helpers/loadConfig"));
exports.OUTPUT_FOLDER = 'serverless-next';
const setNextOptions = async (nextConfig, s3BucketName) => {
    // set s3 bucket name for cache handler during build time
    process.env.STATIC_BUCKET_NAME = s3BucketName;
    const cacheConfig = await (0, loadConfig_1.default)();
    const currentConfig = await import(nextConfig).then((r) => r.default);
    const updatedConfig = {
        ...currentConfig,
        output: 'standalone',
        serverRuntimeConfig: {
            ...currentConfig.serverRuntimeConfig,
            nextServerlessCacheConfig: cacheConfig
        },
        cacheHandler: require.resolve(node_path_1.default.join('..', 'cacheHandler', 'index.js'))
    };
    const currentContent = node_fs_1.default.readFileSync(nextConfig, 'utf-8');
    let updatedContent = `module.exports = ${JSON.stringify(updatedConfig, null, 4)};\n`;
    // Check if the file has .mjs extension
    if (nextConfig.endsWith('.mjs')) {
        updatedContent = `export default ${JSON.stringify(updatedConfig, null, 4)};\n`;
    }
    node_fs_1.default.writeFileSync(nextConfig, updatedContent, 'utf-8');
    // Function to revert back to original content of file
    return () => {
        node_fs_1.default.writeFileSync(nextConfig, currentContent, 'utf-8');
    };
};
const buildNext = async (options) => {
    const { packager, nextConfigPath, s3BucketName } = options;
    const clearNextConfig = await setNextOptions(nextConfigPath, s3BucketName);
    node_child_process_1.default.execSync(packager.buildCommand, { stdio: 'inherit' });
    // Reverts changes to next project
    return clearNextConfig;
};
exports.buildNext = buildNext;
const copyAssets = (outputPath, appPath) => {
    // Copying static assets (like js, css, images, .etc)
    node_fs_1.default.cpSync(node_path_1.default.join(appPath, '.next', 'static'), node_path_1.default.join(outputPath, '_next', 'static'), { recursive: true });
    node_fs_1.default.cpSync(node_path_1.default.join(appPath, '.next', 'standalone'), node_path_1.default.join(outputPath, 'server'), {
        recursive: true
    });
};
const buildApp = async (options) => {
    const { projectSettings, outputPath, s3BucketName } = options;
    const { packager, nextConfigPath, projectPath } = projectSettings;
    const cleanNextApp = await (0, exports.buildNext)({
        packager,
        nextConfigPath,
        s3BucketName
    });
    copyAssets(outputPath, projectPath);
    return cleanNextApp;
};
exports.buildApp = buildApp;
