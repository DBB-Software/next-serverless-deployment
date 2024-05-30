import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { CloudFrontRequestEvent, CloudFrontRequestCallback, CloudFrontRequestResult } from 'aws-lambda'
import https from 'https'

const s3 = new S3Client()

export const handler = async (
  event: CloudFrontRequestEvent,
  context: any,
  callback: CloudFrontRequestCallback
): Promise<void> => {
  const request = event.Records[0].cf.request
  const s3Bucket = process.env.S3_BUCKET as string
  const s3Key = request.uri
  const ebAppUrl = process.env.EB_APP_URL as string

  try {
    // Check if file exists in S3
    await s3.send(
      new HeadObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key
      })
    )

    // If file exists, allow the request to proceed to S3
    callback(null, request)
  } catch (error: any) {
    if (error.name === 'NotFound') {
      // If file does not exist, modify the request to go to Elastic Beanstalk
      const options = {
        hostname: ebAppUrl,
        path: request.uri,
        method: 'GET'
      }

      const req = https.request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          const response: CloudFrontRequestResult = {
            status: res.statusCode?.toString() || '500',
            statusDescription: res.statusMessage || 'Internal Server Error',
            body: data
          }
          callback(null, response)
        })
      })

      req.on('error', (e) => {
        const response: CloudFrontRequestResult = {
          status: '500',
          statusDescription: 'Internal Server Error',
          body: `Error: ${e.message}`
        }
        callback(null, response)
      })

      req.end()
    } else {
      // For other errors, return a 500 response
      const response: CloudFrontRequestResult = {
        status: '500',
        statusDescription: 'Internal Server Error',
        body: `Error: ${error.message}`
      }
      callback(null, response)
    }
  }
}
