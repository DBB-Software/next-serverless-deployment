import { NEXT_CACHE_TAGS_HEADER } from 'next/dist/lib/constants'
import { ListObjectsV2CommandOutput, S3 } from '@aws-sdk/client-s3'
import { PutObjectCommandInput } from '@aws-sdk/client-s3/dist-types/commands/PutObjectCommand'
import { chunkArray } from '../../common/array'
import type { CacheEntry, CacheStrategy, CacheContext } from '@dbbs/next-cache-handler-core'

const TAG_PREFIX = 'revalidateTag'
const NOT_FOUND_ERROR = ['NotFound', 'NoSuchKey']
enum CacheExtension {
  JSON = 'json',
  HTML = 'html',
  RSC = 'rsc'
}
const PAGE_CACHE_EXTENSIONS = Object.values(CacheExtension)
const CHUNK_LIMIT = 1000
const EXT_REGEX = new RegExp(`.(${PAGE_CACHE_EXTENSIONS.join('|')})$`)

export class S3Cache implements CacheStrategy {
  public readonly client: S3
  public readonly bucketName: string

  constructor(bucketName: string) {
    const region = process.env.AWS_REGION
    this.client = new S3({ region })
    this.bucketName = bucketName
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

  async get(pageKey: string, cacheKey: string): Promise<CacheEntry | null> {
    if (!this.client) return null

    const pageData = await this.client
      .getObject({
        Bucket: this.bucketName,
        Key: `${pageKey}/${cacheKey}.${CacheExtension.JSON}`
      })
      .catch((error) => {
        if (NOT_FOUND_ERROR.includes(error.name)) return null
        throw error
      })

    if (!pageData?.Body) return null

    const response = await pageData.Body.transformToString('utf-8')

    return JSON.parse(response)
  }

  async set(pageKey: string, cacheKey: string, data: CacheEntry, ctx: CacheContext): Promise<void> {
    const promises = []
    const baseInput: PutObjectCommandInput = {
      Bucket: this.bucketName,
      Key: `${pageKey}/${cacheKey}`,
      ...(data.revalidate ? { CacheControl: `max-age=${data.revalidate}` } : undefined)
    }

    if (data.value?.kind === 'PAGE' || data.value?.kind === 'ROUTE') {
      const headersTags = this.buildTagKeys(data.value.headers?.[NEXT_CACHE_TAGS_HEADER]?.toString())
      const input: PutObjectCommandInput = { ...baseInput, ...(headersTags ? { Tagging: headersTags } : {}) }

      if (data.value?.kind === 'PAGE') {
        promises.push(
          this.client.putObject({
            ...input,
            Key: `${input.Key}.${CacheExtension.HTML}`,
            Body: data.value.html,
            ContentType: 'text/html'
          })
        )
        promises.push(
          this.client.putObject({
            ...input,
            Key: `${input.Key}.${CacheExtension.JSON}`,
            Body: JSON.stringify(data),
            ContentType: 'application/json'
          })
        )
        if (ctx.isAppRouter) {
          promises.push(
            this.client.putObject({
              ...input,
              Key: `${input.Key}.${CacheExtension.RSC}`,
              Body: data.value.pageData as string, // for server react components we need to safe additional reference data for nextjs.
              ContentType: 'text/x-component'
            })
          )
        }
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
    } else {
      promises.push(
        this.client.putObject({
          ...baseInput,
          Key: `${baseInput.Key}.${CacheExtension.JSON}`,
          Body: JSON.stringify(data),
          ContentType: 'application/json',
          ...(data.tags?.length ? { Tagging: `${this.buildTagKeys(data.tags)}` } : {})
        })
      )
    }

    await Promise.all(promises)
  }

  async revalidateTag(tag: string, allowCacheKeys: string[]): Promise<void> {
    const keysToDelete: string[] = []
    let nextContinuationToken: string | undefined = undefined
    do {
      const { Contents: contents = [], NextContinuationToken: token }: ListObjectsV2CommandOutput =
        await this.client.listObjectsV2({
          Bucket: this.bucketName,
          ContinuationToken: nextContinuationToken
        })
      nextContinuationToken = token

      keysToDelete.push(
        ...(await contents.reduce<Promise<string[]>>(async (acc, { Key: key }) => {
          if (
            !key ||
            (allowCacheKeys.length && !allowCacheKeys.some((allowKey) => key.replace(EXT_REGEX, '').endsWith(allowKey)))
          )
            return acc

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
