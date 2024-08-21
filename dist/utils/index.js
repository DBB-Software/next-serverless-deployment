"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectSettings = exports.findPackager = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const path_1 = __importDefault(require("path"));
const findPackager = (appPath) => {
    return ([
        { lockFile: 'package-lock.json', type: 'npm', buildCommand: 'npm ru build' },
        { lockFile: 'yarn.lock', type: 'yarn', buildCommand: 'yarn build' },
        { lockFile: 'pnpm-lock.yaml', type: 'pnpm', buildCommand: 'pnpm build' }
    ]).find((packager) => node_fs_1.default.existsSync(path_1.default.join(appPath, `${packager.lockFile}`)));
};
exports.findPackager = findPackager;
const getProjectSettings = (projectPath) => {
    let currentPath = projectPath;
    while (currentPath !== '/') {
        const packager = (0, exports.findPackager)(currentPath);
        if (packager) {
            return { root: currentPath, packager, isMonorepo: currentPath !== projectPath };
        }
        currentPath = path_1.default.dirname(currentPath);
    }
};
exports.getProjectSettings = getProjectSettings;
