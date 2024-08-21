"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findConfig = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const findConfig = (configPath) => {
    return ['next-serverless.config.js', 'next-serverless.config.mjs', 'next-serverless.config.ts'].find((config) => node_fs_1.default.existsSync(node_path_1.default.join(configPath, config)));
};
exports.findConfig = findConfig;
async function loadConfig() {
    try {
        const serverConfig = (0, exports.findConfig)(process.cwd());
        if (!serverConfig) {
            throw new Error('Could not find next-serverless.config.(js|mjs|ts)');
        }
        const configPath = node_path_1.default.join(process.cwd(), serverConfig);
        return import(configPath).then((r) => r.default);
    }
    catch (e) {
        throw new Error('Could not load next-serverless.config.(js|mjs|ts)');
    }
}
exports.default = loadConfig;
