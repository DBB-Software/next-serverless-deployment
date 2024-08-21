"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const next_cache_handler_core_1 = require("@dbbs/next-cache-handler-core");
const next_cache_handler_s3_1 = require("@dbbs/next-cache-handler-s3");
const config_1 = __importDefault(require("next/config"));
const { serverRuntimeConfig } = (0, config_1.default)() || {};
const config = serverRuntimeConfig?.nextServerlessCacheConfig;
next_cache_handler_core_1.Cache.addCookies(config?.cacheCookies ?? []);
next_cache_handler_core_1.Cache.addQueries(config?.cacheQueries ?? []);
next_cache_handler_core_1.Cache.addNoCacheMatchers(config?.noCacheRoutes ?? []);
if (config?.enableDeviceSplit) {
    next_cache_handler_core_1.Cache.addDeviceSplit();
}
next_cache_handler_core_1.Cache.setCacheStrategy(new next_cache_handler_s3_1.S3Cache(process.env.STATIC_BUCKET_NAME));
exports.default = next_cache_handler_core_1.Cache;
