import express from 'express'
import { json } from 'body-parser'
import http from 'http'
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { DynamoDBClient, BatchWriteItemCommand, ScanCommand, AttributeValue } from '@aws-sdk/client-dynamodb'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { minimatch } from 'minimatch'
import chunk from 'lodash/chunk'
const port = parseInt(process.env.PORT || '', 10) || 3000
const nextServerPort = 3001
const nextServerHostname = process.env.HOSTNAME || '0.0.0.0'

interface RevalidateBody {
  paths: string[]
}

const app = express()

app.use(json())

const s3Client = new S3Client({ region: process.env.AWS_REGION })
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION })
const cloudfrontClient = new CloudFrontClient({ region: process.env.AWS_REGION })

function transformPathPattern(pattern: string) {
  const cleanedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern
  const hasWildcard = cleanedPattern.includes('*')
  const prefix = cleanedPattern.split('*')[0]
  const minimatchString = hasWildcard
    ? cleanedPattern.replace(/\/\*/g, '/**')
    : cleanedPattern.endsWith('/')
      ? cleanedPattern + '*'
      : cleanedPattern + '/*'
  return { prefix, hasWildcard, minimatchString }
}

async function listS3Objects(pattern: string) {
  const { prefix, minimatchString } = transformPathPattern(pattern)

  const { Contents = [] } = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.STATIC_BUCKET_NAME,
      Prefix: prefix
    })
  )

  return Contents.filter((obj) => obj.Key && minimatch(obj.Key, minimatchString)).map((obj) => ({
    Key: obj.Key!
  }))
}

async function listDynamoItems(pattern: string): Promise<{ key: Record<string, AttributeValue> }[]> {
  const { prefix, minimatchString } = transformPathPattern(pattern)

  const { Items = [] } = await dynamoClient.send(
    new ScanCommand({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      FilterExpression: 'contains(pageKey, :pattern)',
      ExpressionAttributeValues: {
        ':pattern': { S: prefix }
      }
    })
  )

  return Items.filter((item) => item.pageKey?.S && minimatch(item.pageKey.S, minimatchString)).map((item) => ({
    key: { pageKey: item.pageKey }
  }))
}

async function deleteS3Objects(objects: { Key: string }[]) {
  if (!objects.length) return

  // S3 can delete max 1000 objects in one call
  const chunks = chunk(objects, 1000)
  await Promise.all(
    chunks.map((batch) =>
      s3Client.send(
        new DeleteObjectsCommand({
          Bucket: process.env.STATIC_BUCKET_NAME,
          Delete: { Objects: batch }
        })
      )
    )
  )
}

async function deleteDynamoItems(items: { key: Record<string, AttributeValue> }[]) {
  if (!items.length) return

  const chunks = chunk(items, 10)
  await Promise.all(
    chunks.map((batch) =>
      dynamoClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [process.env.DYNAMODB_CACHE_TABLE!]: batch.map((item) => ({
              DeleteRequest: { Key: item.key }
            }))
          }
        })
      )
    )
  )
}

function categorizePaths(paths: string[]) {
  return paths.reduce(
    (acc, path) => {
      if (path.includes('*')) {
        acc.wildcardPaths.push(path)
      } else {
        acc.exactPaths.push(path)
      }
      return acc
    },
    { wildcardPaths: [] as string[], exactPaths: [] as string[] }
  )
}

async function revalidateNextPages(paths: string[]) {
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

async function handleWildcardPath(wildcardPath: string) {
  const [s3Objects, dynamoItems] = await Promise.all([listS3Objects(wildcardPath), listDynamoItems(wildcardPath)])
  return Promise.all([deleteS3Objects(s3Objects), deleteDynamoItems(dynamoItems)])
}

app.post('/api/revalidate-pages', async (req, res) => {
  try {
    const { paths } = req.body as RevalidateBody

    if (!paths.length) {
      res.status(400).json({ Message: 'paths is required.' }).end()
      return
    }

    const { exactPaths, wildcardPaths } = categorizePaths(paths)

    await Promise.all([revalidateNextPages(exactPaths), ...wildcardPaths.map(handleWildcardPath)])

    await cloudfrontClient.send(
      new CreateInvalidationCommand({
        DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
          Paths: { Quantity: paths.length, Items: paths },
          CallerReference: Date.now().toString()
        }
      })
    )

    res.status(200).json({ Message: 'Revalidated.' })
  } catch (err) {
    console.error('Failed to revalidate:', err)
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
