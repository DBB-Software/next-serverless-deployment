"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConfigFile = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const loadConfig_1 = require("./loadConfig");
const CONFIG_FILE_NAME = 'next-serverless.config.js';
const CONFIG_TEMPLATE = `/**
 * @type {import('@dbbs/next-serverless-deployment').CacheConfig}
 */
const config = {
  noCacheRoutes: [],
  cacheCookies: [],
  cacheQueries: [],
  enableDeviceSplit: false
}

module.exports = config
`;
const createConfigFile = () => {
    const configFilePath = node_path_1.default.resolve(process.cwd(), CONFIG_FILE_NAME);
    const serverConfig = (0, loadConfig_1.findConfig)(process.cwd());
    if (!serverConfig && !node_fs_1.default.existsSync(configFilePath)) {
        node_fs_1.default.writeFileSync(configFilePath, CONFIG_TEMPLATE, 'utf-8');
        console.log(`Created sample configuration file at ${configFilePath}`);
    }
    else {
        console.log(`Configuration file already exists at ${configFilePath}`);
    }
};
exports.createConfigFile = createConfigFile;
