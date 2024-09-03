"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudFrontDistribution = void 0;
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const cdk_1 = require("../../common/cdk");
const constants_1 = require("../../constants");
const OneMonthCache = aws_cdk_lib_1.Duration.days(30);
const NoCache = aws_cdk_lib_1.Duration.seconds(0);
const defaultNextQueries = ['_rsc'];
const defaultNextHeaders = ['Cache-Control'];
class CloudFrontDistribution extends constructs_1.Construct {
    cf;
    constructor(scope, id, props) {
        super(scope, id);
        const { staticBucket, requestEdgeFunction, responseEdgeFunction, cacheConfig } = props;
        const splitCachePolicy = new cloudfront.CachePolicy(this, 'SplitCachePolicy', {
            cachePolicyName: `${id}-SplitCachePolicy`,
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(...defaultNextQueries.concat(cacheConfig.cacheQueries ?? [])),
            cookieBehavior: cacheConfig.cacheCookies?.length
                ? cloudfront.CacheCookieBehavior.allowList(...cacheConfig.cacheCookies)
                : cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList(...defaultNextHeaders, ...Object.values(constants_1.HEADER_DEVICE_TYPE)),
            minTtl: NoCache,
            defaultTtl: NoCache // no caching by default, cache value is going to be used from Cache-Control header.
        });
        const longCachePolicy = new cloudfront.CachePolicy(this, 'LongCachePolicy', {
            cachePolicyName: `${id}-LongCachePolicy`,
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            defaultTtl: OneMonthCache,
            maxTtl: OneMonthCache,
            minTtl: OneMonthCache
        });
        const s3Origin = new origins.S3Origin(staticBucket);
        this.cf = new cloudfront.Distribution(this, id, {
            defaultBehavior: {
                origin: s3Origin,
                edgeLambdas: [
                    {
                        functionVersion: requestEdgeFunction.currentVersion,
                        eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST
                    },
                    {
                        functionVersion: responseEdgeFunction.currentVersion,
                        eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE
                    }
                ],
                cachePolicy: splitCachePolicy
            },
            defaultRootObject: '',
            additionalBehaviors: {
                ['/_next/data/*']: {
                    origin: s3Origin,
                    edgeLambdas: [
                        {
                            functionVersion: requestEdgeFunction.currentVersion,
                            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST
                        }
                    ],
                    cachePolicy: splitCachePolicy
                },
                '/_next/*': {
                    origin: s3Origin,
                    cachePolicy: longCachePolicy
                }
            }
        });
        (0, cdk_1.addOutput)(this, `${id}-CloudfrontDistributionId`, this.cf.distributionId);
    }
}
exports.CloudFrontDistribution = CloudFrontDistribution;
