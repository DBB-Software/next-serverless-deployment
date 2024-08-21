import type { CloudFrontRequestCallback, Context, CloudFrontResponseEvent } from 'aws-lambda';
export declare const handler: (event: CloudFrontResponseEvent, _context: Context, callback: CloudFrontRequestCallback) => Promise<void>;
