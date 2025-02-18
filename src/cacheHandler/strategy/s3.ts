import { NEXT_CACHE_TAGS_HEADER } from 'next/dist/lib/constants'
import { type ListObjectsV2CommandOutput, type PutObjectCommandInput, S3 } from '@aws-sdk/client-s3'
import { DynamoDB } from '@aws-sdk/client-dynamodb'
import { chunkArray } from '../../common/array'
import { type CacheEntry, type CacheStrategy, type CacheContext, CachedRouteKind } from '@dbbs/next-cache-handler-core'

export const TAG_PREFIX = 'revalidateTag'
enum CacheExtension {
  JSON = 'json',
  HTML = 'html',
  RSC = 'rsc'
}
const PAGE_CACHE_EXTENSIONS = Object.values(CacheExtension)
const CHUNK_LIMIT = 1000
export const CACHE_ONE_YEAR = 31536000

export class S3Cache implements CacheStrategy {
  public readonly client: S3
  public readonly bucketName: string
  #dynamoDBClient: DynamoDB

  constructor(bucketName: string) {
    const region = process.env.AWS_REGION
    this.client = new S3({ region })
    this.bucketName = bucketName
    this.#dynamoDBClient = new DynamoDB({ region })
  }

  buildTagKeys(tags?: string | string[]) {
    if (!tags?.length) return ''
    return (Array.isArray(tags) ? tags : tags.split(',')).map((tag, index) => `${TAG_PREFIX}${index}=${tag}`).join('&')
  }

  async deleteObjects(keysToDelete: string[]) {
    await Promise.allSettled(
      chunkArray(keysToDelete, CHUNK_LIMIT).map((chunk) => {
        return this.client.deleteObjects({
          Bucket: this.bucketName,
          Delete: { Objects: chunk.map((Key) => ({ Key })) }
        })
      })
    )
  }

  async get(): Promise<null> {
    // We always need to return null to make nextjs revalidate the page and create new file in s3
    // caching retreiving logic is handled by CloudFront and origin response lambda
    // we can't use nextjs cache retrival since it is required to re-render page during validation
    // but nextjs built in `revalidate` only clears cache, but does not re-render the page
    // so we need to have custom handler to revalidate and re-render the page
    return null
  }

  async set(pageKey: string, cacheKey: string, data: CacheEntry, ctx: CacheContext): Promise<void> {
    if (!data.value?.kind || data.value.kind === CachedRouteKind.REDIRECT || data.revalidate === 0)
      return Promise.resolve()

    let headersTags = ''
    if ('headers' in data.value) {
      headersTags = this.buildTagKeys(data.value?.headers?.[NEXT_CACHE_TAGS_HEADER]?.toString())
    }

    const baseInput: PutObjectCommandInput = {
      Bucket: this.bucketName,
      Key: `${pageKey}/${cacheKey}`,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      },
      CacheControl: `s-maxage=${data.revalidate || CACHE_ONE_YEAR}, stale-while-revalidate=${CACHE_ONE_YEAR - (data.revalidate || 0)}`
    }
    const input: PutObjectCommandInput = { ...baseInput }

    const promises = [
      this.#dynamoDBClient.putItem({
        TableName: process.env.DYNAMODB_CACHE_TABLE!,
        Item: {
          pageKey: { S: pageKey },
          cacheKey: { S: cacheKey },
          s3Key: { S: baseInput.Key! },
          tags: { S: [headersTags, this.buildTagKeys(data.tags)].filter(Boolean).join('&') },
          createdAt: { S: new Date().toISOString() }
        }
      })
    ]

    switch (data.value.kind) {
      case CachedRouteKind.APP_PAGE: {
        promises.push(
          ...[
            this.client.putObject({
              ...input,
              Key: `${input.Key}.${CacheExtension.HTML}`,
              Body: data.value.html,
              ContentType: 'text/html'
            }),
            this.client.putObject({
              ...input,
              Key: `${input.Key}.${CacheExtension.RSC}`,
              Body: data.value.rscData?.toString() as string, // for server react components we need to safe additional reference data for nextjs.
              ContentType: 'text/x-component'
            })
          ]
        )
        break
      }
      case CachedRouteKind.FETCH: {
        promises.push(
          this.client.putObject({
            ...input,
            Key: `${input.Key}.${CacheExtension.JSON}`,
            Body: data.value.data.body.toString(),
            ContentType: 'application/json'
          })
        )
        break
      }
      case CachedRouteKind.APP_ROUTE:
      case CachedRouteKind.ROUTE: {
        promises.push(
          this.client.putObject({
            ...input,
            Key: `${input.Key}.${CacheExtension.JSON}`,
            Body: data.value.body.toString(),
            ContentType: 'application/json'
          })
        )
        break
      }
      case CachedRouteKind.PAGE:
      case CachedRouteKind.PAGES: {
        promises.push(
          this.client.putObject({
            ...input,
            Key: `${input.Key}.${CacheExtension.HTML}`,
            Body: data.value.html,
            ContentType: 'text/html'
          })
        )

        if (ctx.isAppRouter) {
          promises.push(
            this.client.putObject({
              ...input,
              Key: `${input.Key}.${CacheExtension.RSC}`,
              Body: data.value.pageData as unknown as string, // for server react components we need to safe additional reference data for nextjs.
              ContentType: 'text/x-component'
            })
          )
        } else {
          promises.push(
            this.client.putObject({
              ...input,
              Key: `${input.Key}.${CacheExtension.JSON}`,
              Body: JSON.stringify(data),
              ContentType: 'application/json'
            })
          )
        }
      }
    }

    await Promise.all(promises)
  }

  async revalidateTag(tag: string): Promise<void> {
    const keysToDelete: string[] = []
    let nextContinuationToken: string | undefined = undefined

    const result = await this.#dynamoDBClient.query({
      TableName: process.env.DYNAMODB_CACHE_TABLE!,
      KeyConditionExpression: '#field = :value',
      ExpressionAttributeNames: {
        '#field': 'tags'
      },
      ExpressionAttributeValues: {
        ':value': { S: tag }
      }
    })

    console.log('HERE_IS_RESULT', result)
    console.log('HERE_IS_RESULT_ITEMS', result.Items)
    do {
      const { Contents: contents = [], NextContinuationToken: token }: ListObjectsV2CommandOutput =
        await this.client.listObjectsV2({
          Bucket: this.bucketName,
          ContinuationToken: nextContinuationToken
        })
      nextContinuationToken = token

      keysToDelete.push(
        ...(await contents.reduce<Promise<string[]>>(async (acc, { Key: key }) => {
          if (!key) {
            return acc
          }

          const { TagSet = [] } = await this.client.getObjectTagging({ Bucket: this.bucketName, Key: key })
          const tags = TagSet.filter(({ Key: key }) => key?.startsWith(TAG_PREFIX)).map(({ Value: tags }) => tags || '')

          if (tags.includes(tag)) {
            return [...(await acc), key]
          }
          return acc
        }, Promise.resolve([])))
      )
    } while (nextContinuationToken)

    await this.deleteObjects(keysToDelete)
    return
  }

  async delete(pageKey: string, cacheKey: string): Promise<void> {
    await this.client.deleteObjects({
      Bucket: this.bucketName,
      Delete: { Objects: PAGE_CACHE_EXTENSIONS.map((ext) => ({ Key: `${pageKey}/${cacheKey}.${ext}` })) }
    })
  }

  async deleteAllByKeyMatch(pageKey: string, cacheKey: string): Promise<void> {
    if (cacheKey) {
      await this.deleteObjects(PAGE_CACHE_EXTENSIONS.map((ext) => `${pageKey}/${cacheKey}.${ext}`))
      await this.#dynamoDBClient.deleteItem({
        TableName: process.env.DYNAMODB_CACHE_TABLE!,
        Key: {
          pageKey: {
            S: pageKey
          },
          cacheKey: {
            S: cacheKey
          }
        }
      })
      return
    }
    const keysToDelete: string[] = []
    let nextContinuationToken: string | undefined = undefined
    do {
      const { Contents: contents = [], NextContinuationToken: token }: ListObjectsV2CommandOutput =
        await this.client.listObjectsV2({
          Bucket: this.bucketName,
          ContinuationToken: nextContinuationToken,
          Prefix: `${pageKey}/`,
          Delimiter: '/'
        })

      nextContinuationToken = token

      keysToDelete.push(
        ...contents.reduce<string[]>(
          (acc, { Key: key = '' }) => (PAGE_CACHE_EXTENSIONS.some((ext) => key.endsWith(ext)) ? [...acc, key] : acc),
          []
        )
      )
    } while (nextContinuationToken)

    if (keysToDelete.length) await this.deleteObjects(keysToDelete)

    return
  }
}
