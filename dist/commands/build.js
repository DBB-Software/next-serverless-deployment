"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const next_1 = require("../build/next");
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
    const cleanNextApp = await (0, next_1.buildNextApp)({
        packager,
        nextConfigPath,
        s3BucketName
    });
    copyAssets(outputPath, projectPath);
    return cleanNextApp;
};
exports.buildApp = buildApp;
