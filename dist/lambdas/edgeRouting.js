"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const http_1 = __importDefault(require("http"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const constants_1 = require("../constants");
const s3 = new client_s3_1.S3Client({ region: process.env.S3_BUCKET_REGION });
async function makeHTTPRequest(options) {
    return new Promise((resolve, reject) => {
        const req = http_1.default.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    body: data,
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage
                });
            });
        });
        req.on('error', (e) => {
            reject(e);
        });
        req.end();
    });
}
function convertCloudFrontHeaders(cloudfrontHeaders, allowHeaders) {
    if (!cloudfrontHeaders)
        return {};
    return Object.keys(cloudfrontHeaders).reduce((prev, key) => !allowHeaders?.length || allowHeaders.includes(key)
        ? {
            ...prev,
            [key]: cloudfrontHeaders[key][0].value
        }
        : prev, {});
}
function transformQueryToObject(query) {
    return query ? Object.fromEntries(new URLSearchParams(query).entries()) : {};
}
function transformCookiesToObject(cookies) {
    if (!cookies?.length)
        return {};
    return cookies.reduce((res, { value }) => {
        value.split(';').forEach((cookie) => {
            const [key, val] = cookie.split('=').map((part) => part.trim());
            res[key] = val;
        });
        return res;
    }, {});
}
function buildCacheKey(keys, data, prefix) {
    if (!keys.length)
        return null;
    const cacheKeys = keys.reduce((prev, curr) => (!data[curr] ? prev : [...prev, `${curr}=${data[curr]}`]), []);
    return !cacheKeys.length ? null : `${prefix}(${cacheKeys.join('-')})`;
}
function getCurrentDeviceType(headers) {
    const deviceHeaders = convertCloudFrontHeaders(headers, Object.values(constants_1.HEADER_DEVICE_TYPE));
    if (!deviceHeaders || !Object.keys(deviceHeaders).length)
        return null;
    if (deviceHeaders[constants_1.HEADER_DEVICE_TYPE.Desktop] === 'true') {
        return null;
    }
    else if (deviceHeaders[constants_1.HEADER_DEVICE_TYPE.Mobile] === 'true') {
        return 'mobile';
    }
    else if (deviceHeaders[constants_1.HEADER_DEVICE_TYPE.Tablet] === 'true') {
        return 'tablet';
    }
    else if (deviceHeaders[constants_1.HEADER_DEVICE_TYPE.SmartTV] === 'true') {
        return 'smarttv';
    }
    return null;
}
function getFileExtensionTypeFromRequest(request) {
    const contentType = request.headers['content-type']?.[0]?.value ?? '';
    const isRSC = request.querystring.includes('_rsc');
    if (isRSC) {
        return 'rsc';
    }
    if (contentType.includes('json') || request.uri.endsWith('.json')) {
        return 'json';
    }
    return 'html';
}
function getPageKeyFromRequest(request) {
    const key = request.uri.replace('/', '');
    // Home page in stored under `index` path
    if (!key) {
        return 'index';
    }
    // NextJS page router page data when do soft navigation.
    if (key.match('_next/data')) {
        return key.split(/_next\/data\/[a-zA-z0-9]+\//)[1].replace('.json', '');
    }
    return key;
}
function getS3ObjectPath(request, cacheConfig) {
    // Home page in stored under `index` path
    const pageKey = getPageKeyFromRequest(request);
    const fileExtension = getFileExtensionTypeFromRequest(request);
    const cacheKey = [
        cacheConfig.enableDeviceSplit ? getCurrentDeviceType(request.headers) : null,
        buildCacheKey(cacheConfig.cacheCookies?.toSorted() ?? [], transformCookiesToObject(request.headers.cookie), 'cookie'),
        buildCacheKey(cacheConfig.cacheQueries?.toSorted() ?? [], transformQueryToObject(request.querystring), 'query')
    ]
        .filter(Boolean)
        .join('-');
    const md5CacheKey = node_crypto_1.default.createHash('md5').update(cacheKey).digest('hex');
    return {
        s3Key: `${pageKey}/${md5CacheKey}.${fileExtension}`,
        cacheKey,
        md5CacheKey
    };
}
async function checkFileExistsInS3(s3Bucket, s3Key) {
    try {
        await s3.send(new client_s3_1.HeadObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key
        }));
        return true;
    }
    catch (e) {
        if (e.name?.includes('NotFound'))
            return false;
        throw e;
    }
}
const handler = async (event, _context, callback) => {
    const request = event.Records[0].cf.request;
    const s3Bucket = process.env.S3_BUCKET;
    const cacheConfig = process.env.CACHE_CONFIG;
    const { s3Key } = getS3ObjectPath(request, cacheConfig);
    const ebAppUrl = process.env.EB_APP_URL;
    const originalUri = request.uri;
    try {
        // Check if file exists in S3
        const isFileExists = await checkFileExistsInS3(s3Bucket, s3Key);
        if (isFileExists) {
            // Modify s3 path request
            request.uri = `/${s3Key}`;
            // If file exists, allow the request to proceed to S3
            callback(null, request);
        }
        else {
            const options = {
                hostname: ebAppUrl,
                path: `${originalUri}${request.querystring ? `?${request.querystring}` : ''}`,
                method: request.method,
                headers: convertCloudFrontHeaders(request.headers)
            };
            const { body, statusCode, statusMessage } = await makeHTTPRequest(options);
            callback(null, {
                status: statusCode?.toString() || '500',
                statusDescription: statusMessage || 'Internal Server Error',
                body
            });
        }
    }
    catch (_e) {
        const error = _e;
        callback(null, {
            status: '500',
            statusDescription: 'Internal Server Error',
            body: `Error: ${error.message}`
        });
    }
};
exports.handler = handler;
