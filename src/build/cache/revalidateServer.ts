import express from 'express'
import { json } from 'body-parser'
import { S3 } from '@aws-sdk/client-s3'
import { DynamoDB, type AttributeValue } from '@aws-sdk/client-dynamodb'
import http from 'http'
import { chunkArray } from '../../common/array'

const port = parseInt(process.env.PORT || '', 10) || 3000
const nextServerPort = 3001
const nextServerHostname = process.env.HOSTNAME || '0.0.0.0'

const PAGE_CACHE_EXTENSIONS = ['json', 'html', 'rsc']
const CHUNK_LIMIT = 1000
const DYNAMODB_BATCH_LIMIT = 25

interface RevalidateBody {
  paths: string[]
  cacheSegment?: string
}

const s3 = new S3({ region: process.env.AWS_REGION })
const dynamoDB = new DynamoDB({ region: process.env.AWS_REGION })

async function deleteS3Objects(bucketName: string, keys: string[]) {
  if (!keys.length) return

  // Delete objects in chunks to stay within AWS limits
  await Promise.allSettled(
    chunkArray(keys, CHUNK_LIMIT).map((chunk) => {
      return s3.deleteObjects({
        Bucket: bucketName,
        Delete: { Objects: chunk.map((Key) => ({ Key })) }
      })
    })
  )
}

async function batchDeleteFromDynamoDB(tableName: string, items: Record<string, AttributeValue>[]) {
  if (!items.length) return

  // Split items into chunks of 25 (DynamoDB batch limit)
  const chunks = chunkArray(items, DYNAMODB_BATCH_LIMIT)

  await Promise.all(
    chunks.map(async (chunk) => {
      const deleteRequests = chunk.map((item) => ({
        DeleteRequest: {
          Key: item
        }
      }))

      try {
        await dynamoDB.batchWriteItem({
          RequestItems: {
            [tableName]: deleteRequests
          }
        })
      } catch (error) {
        console.error('Error in batch delete:', error)
        // Handle unprocessed items if needed
        throw error
      }
    })
  )
}

const app = express()

app.use(json())

app.post('/api/revalidate-pages', async (req, res) => {
  try {
    const { paths, cacheSegment } = req.body as RevalidateBody

    if (!paths.length) {
      res.status(400).json({ Message: 'paths is required.' }).end()
    } else {
      const attributeValues: Record<string, AttributeValue> = {}
      const keyConditionExpression =
        paths.length === 1 ? 'pageKey = :path0' : 'pageKey IN (' + paths.map((_, i) => `:path${i}`).join(',') + ')'

      paths.forEach((path, index) => {
        attributeValues[`:path${index}`] = { S: path.substring(1) }
      })

      if (cacheSegment) {
        attributeValues[':segment'] = { S: cacheSegment }
      }

      const result = await dynamoDB.query({
        TableName: process.env.DYNAMODB_CACHE_TABLE!,
        IndexName: 'cacheKey-index',
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: cacheSegment ? 'cacheKey = :segment' : undefined,
        ExpressionAttributeValues: attributeValues
      })

      if (result?.Items?.length) {
        const s3KeysToDelete = result.Items.flatMap((item) => {
          return PAGE_CACHE_EXTENSIONS.map((ext) => `${item.s3Key.S}.${ext}`)
        })
        await deleteS3Objects(process.env.STATIC_BUCKET_NAME!, s3KeysToDelete)
        await batchDeleteFromDynamoDB(process.env.DYNAMODB_CACHE_TABLE!, result.Items)
      }

      await Promise.all(
        paths.map((path) =>
          http.get({
            hostname: nextServerHostname,
            port: nextServerPort,
            path
          })
        )
      )
    }

    res.status(200).json({ Message: 'Revalidated.' })
  } catch (err) {
    res.status(400).json({ Message: err })
  }
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`> Revalidation server ready on port ${port}`)
})
