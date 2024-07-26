import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { CloudFrontRequestEvent, CloudFrontRequestCallback, Context } from 'aws-lambda'
import { type RequestOptions } from 'http'
import { CacheConfig } from '../types'
import { convertCloudFrontHeaders, getS3ObjectPath, makeHTTPRequest } from '../common/utils'


const s3 = new S3Client({ region: process.env.S3_BUCKET_REGION! })

async function checkFileIsExpiredInS3(s3Bucket: string, s3Key: string): Promise<boolean> {
    try {
      const { ExpiresString } = await s3.send(
        new HeadObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key
        })
      )
      if(ExpiresString) {
        return new Date(ExpiresString).getTime() < new Date().getTime()
      }
      
      return false
    } catch (e) {
      if ((e as Error).name?.includes('NotFound')) return false
  
      throw e
    }
  }

export const handler = async (
    event: CloudFrontRequestEvent,
    _context: Context,
    callback: CloudFrontRequestCallback
  ): Promise<void> => { 
    const request = event.Records[0].cf.request
    const s3Bucket = process.env.S3_BUCKET!
    const cacheConfig = process.env.CACHE_CONFIG as CacheConfig
    const { s3Key } = getS3ObjectPath(request, cacheConfig)
    const ebAppUrl = process.env.EB_APP_URL!
    const originalUri = request.uri

    try {
        // Check if file is expired in S3
        const isFileExpired = await checkFileIsExpiredInS3(s3Bucket, s3Key)
    
        if (isFileExpired) {
          const options: RequestOptions = {
            hostname: ebAppUrl,
            path: `api/revalidate?path=${originalUri}${request.querystring ? `${request.querystring}` : ''}`,
            method: request.method,
            headers: convertCloudFrontHeaders(request.headers)
          }
    
          const { body, statusCode, statusMessage } = await makeHTTPRequest(options)
    
          callback(null, {
            status: statusCode?.toString() || '500',
            statusDescription: statusMessage || 'Internal Server Error',
            body
          })
        return;
        }
        //continue execution
        callback(null, request)
      } catch (_e) {
        const error = _e as Error
        callback(null, {
          status: '500',
          statusDescription: 'Internal Server Error',
          body: `Error: ${error.message}`
        })
      }
  }