"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectSettings = exports.findNextConfig = exports.findPackager = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const path_1 = __importDefault(require("path"));
const findPackager = (appPath) => {
    return ([
        { lockFile: 'package-lock.json', type: 'npm', buildCommand: 'npm run build' },
        { lockFile: 'yarn.lock', type: 'yarn', buildCommand: 'yarn build' },
        { lockFile: 'pnpm-lock.yaml', type: 'pnpm', buildCommand: 'pnpm build' }
    ]).find((packager) => node_fs_1.default.existsSync(path_1.default.join(appPath, `${packager.lockFile}`)));
};
exports.findPackager = findPackager;
const findNextConfig = (appPath) => {
    return ['next.config.js', 'next.config.mjs'].find((config) => node_fs_1.default.existsSync(path_1.default.join(appPath, config)));
};
exports.findNextConfig = findNextConfig;
const getProjectSettings = (projectPath) => {
    let currentPath = projectPath;
    const nextConfig = (0, exports.findNextConfig)(projectPath);
    if (!nextConfig) {
        throw new Error('Could not find next.config.(js|mjs)');
    }
    while (currentPath !== '/') {
        const packager = (0, exports.findPackager)(currentPath);
        if (packager) {
            return {
                root: currentPath,
                packager,
                isMonorepo: currentPath !== projectPath,
                projectPath,
                nextConfigPath: path_1.default.join(projectPath, nextConfig)
            };
        }
        currentPath = path_1.default.dirname(currentPath);
    }
};
exports.getProjectSettings = getProjectSettings;
