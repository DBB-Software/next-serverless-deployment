import { CacheEntry, CacheContext } from '@dbbs/next-cache-handler-core'
import { S3Cache } from './s3'

const mockHtmlPage = '<p>My Page</p>'

export const mockCacheEntry = {
  value: {
    pageData: {},
    html: mockHtmlPage,
    kind: 'PAGE',
    postponed: undefined,
    headers: undefined,
    status: 200
  },
  lastModified: 100000
} satisfies CacheEntry

const mockCacheContext: CacheContext = {
  isAppRouter: false,
  serverCacheDirPath: ''
}

const mockBucketName = 'test-bucket'
const cacheKey = 'test'
const s3Cache = new S3Cache(mockBucketName)

const store = new Map()
const mockGetObject = jest.fn().mockImplementation(async ({ Key }) => {
  const res = store.get(Key)
  return res
    ? { Body: { transformToString: () => res.Body }, Metadata: res.Metadata }
    : { Body: undefined, Metadata: undefined }
})
const mockPutObject = jest
  .fn()
  .mockImplementation(async ({ Key, Body, Metadata }) => store.set(Key, { Body, Metadata }))
const mockDeleteObject = jest.fn().mockImplementation(async ({ Key }) => store.delete(Key))
const mockDeleteObjects = jest
  .fn()
  .mockImplementation(async ({ Delete: { Objects } }: { Delete: { Objects: { Key: string }[] } }) =>
    Objects.forEach(({ Key }) => store.delete(Key))
  )
const mockGetObjectList = jest
  .fn()
  .mockImplementation(async () => ({ Contents: [...store.keys()].map((key) => ({ Key: key })) }))
const mockGetObjectTagging = jest
  .fn()
  .mockImplementation(() => ({ TagSet: [{ Key: 'revalidateTag0', Value: cacheKey }] }))

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3: jest.fn().mockReturnValue({
      getObject: jest.fn((...params) => mockGetObject(...params)),
      putObject: jest.fn((...params) => mockPutObject(...params)),
      deleteObject: jest.fn((...params) => mockDeleteObject(...params)),
      deleteObjects: jest.fn((...params) => mockDeleteObjects(...params)),
      listObjectsV2: jest.fn((...params) => mockGetObjectList(...params)),
      getObjectTagging: jest.fn((...params) => mockGetObjectTagging(...params)),
      config: {}
    })
  }
})

describe('S3Cache', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })
  afterAll(() => {
    jest.restoreAllMocks()
  })

  it('should set and read the cache for page router', async () => {
    await s3Cache.set(cacheKey, cacheKey, mockCacheEntry, mockCacheContext)
    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(2)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.html`,
      Body: mockHtmlPage,
      ContentType: 'text/html'
    })
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`,
      Body: JSON.stringify(mockCacheEntry.value.pageData),
      ContentType: 'application/json'
    })

    const result = await s3Cache.get(cacheKey, cacheKey)
    expect(result).toEqual(mockCacheEntry.value.pageData)
    expect(s3Cache.client.getObject).toHaveBeenCalledTimes(1)
    expect(s3Cache.client.getObject).toHaveBeenCalledWith({
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`
    })
  })

  it('should set and read the cache for app router', async () => {
    await s3Cache.set(cacheKey, cacheKey, mockCacheEntry, { ...mockCacheContext, isAppRouter: true })
    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(2)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.html`,
      Body: mockHtmlPage,
      ContentType: 'text/html'
    })
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.rsc`,
      Body: mockCacheEntry.value.pageData,
      ContentType: 'text/x-component'
    })

    const result = await s3Cache.get(cacheKey, cacheKey)
    expect(result).toEqual(mockCacheEntry.value.pageData)
    expect(s3Cache.client.getObject).toHaveBeenCalledTimes(1)
    expect(s3Cache.client.getObject).toHaveBeenCalledWith({
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`
    })
  })

  it('should delete cache value', async () => {
    await s3Cache.set(cacheKey, cacheKey, mockCacheEntry, mockCacheContext)
    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(2)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.html`,
      Body: mockHtmlPage,
      ContentType: 'text/html'
    })
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`,
      Body: JSON.stringify(mockCacheEntry.value.pageData),
      ContentType: 'application/json'
    })

    const result = await s3Cache.get(cacheKey, cacheKey)
    expect(result).toEqual(mockCacheEntry.value.pageData)
    expect(s3Cache.client.getObject).toHaveBeenCalledTimes(1)
    expect(s3Cache.client.getObject).toHaveBeenCalledWith({
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`
    })

    await s3Cache.delete(cacheKey, cacheKey)
    const updatedResult = await s3Cache.get(cacheKey, cacheKey)
    expect(updatedResult).toBeNull()
    expect(s3Cache.client.deleteObjects).toHaveBeenCalledTimes(1)
    expect(s3Cache.client.deleteObjects).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Delete: {
        Objects: [
          { Key: `${cacheKey}/${cacheKey}.json` },
          { Key: `${cacheKey}/${cacheKey}.html` },
          { Key: `${cacheKey}/${cacheKey}.rsc` }
        ]
      }
    })
  })

  it('should revalidate cache by tag', async () => {
    const mockCacheEntryWithTags = { ...mockCacheEntry, tags: [cacheKey] }
    await s3Cache.set(cacheKey, cacheKey, mockCacheEntryWithTags, mockCacheContext)

    expect(await s3Cache.get(cacheKey, cacheKey)).toEqual(mockCacheEntryWithTags.value.pageData)

    await s3Cache.revalidateTag(cacheKey)

    expect(await s3Cache.get(cacheKey, cacheKey)).toBeNull()
  })

  it('should revalidate cache by path', async () => {
    await s3Cache.set(cacheKey, cacheKey, mockCacheEntry, mockCacheContext)

    expect(await s3Cache.get(cacheKey, cacheKey)).toEqual(mockCacheEntry.value.pageData)

    await s3Cache.deleteAllByKeyMatch(cacheKey, '')
    expect(await s3Cache.get(cacheKey, cacheKey)).toBeNull()
  })
})
