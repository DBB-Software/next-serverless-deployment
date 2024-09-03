"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLambda = void 0;
const esbuild_1 = require("esbuild");
const node_path_1 = __importDefault(require("node:path"));
const buildLambda = (name, outDir, options) => {
    const resultedFile = node_path_1.default.join(outDir, 'server-functions', name, 'index.js');
    const res = (0, esbuild_1.buildSync)({
        target: 'es2022',
        format: 'cjs',
        platform: 'node',
        bundle: true,
        minify: true,
        external: ['node:*', 'next', '@aws-sdk/*'],
        entryPoints: [node_path_1.default.join(__dirname, '..', 'lambdas', `${name}.js`)],
        outfile: resultedFile,
        ...options
    });
    if (res.errors?.length > 0) {
        res.errors.forEach((err) => console.error('Build lambda error:', err));
        throw new Error('Error during building lambda function');
    }
    return resultedFile;
};
exports.buildLambda = buildLambda;
