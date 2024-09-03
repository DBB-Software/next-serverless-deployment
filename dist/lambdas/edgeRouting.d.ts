import type { CloudFrontRequestEvent, CloudFrontRequestCallback, Context } from 'aws-lambda';
export declare const handler: (event: CloudFrontRequestEvent, _context: Context, callback: CloudFrontRequestCallback) => Promise<void>;
