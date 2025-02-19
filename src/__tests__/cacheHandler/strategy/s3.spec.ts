import { CacheEntry, CacheContext, CachedRouteKind } from '@dbbs/next-cache-handler-core'
import { S3Cache, TAG_PREFIX, CACHE_ONE_YEAR } from '../../../cacheHandler/strategy/s3'
import {
  mockRedirectCacheEntry,
  mockPageCacheEntry,
  mockAppPageCacheEntry,
  mockFetchCacheEntry,
  mockRouteCacheEntry,
  mockAppRouteCacheEntry
} from '../../__mocks__/cacheEntries'

const mockHtmlPage = '<p>My Page</p>'

export const mockCacheEntry = {
  value: {
    pageData: {},
    html: mockHtmlPage,
    kind: CachedRouteKind.PAGE,
    headers: undefined,
    status: 200
  },
  lastModified: 100000
} satisfies CacheEntry

const mockRevalidate = 100
const mockCacheControlRevalidateHeader = `s-maxage=${mockRevalidate}, stale-while-revalidate=${CACHE_ONE_YEAR - mockRevalidate}`

const mockCacheContext: CacheContext = {
  isAppRouter: false,
  serverCacheDirPath: ''
}

const mockBucketName = 'test-bucket'
const cacheKey = 'test'
const pageKey = 'index'
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

const mockDynamoQuery = jest.fn()
const mockDynamoPutItem = jest.fn()
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDB: jest.fn().mockReturnValue({
      query: jest.fn((...params) => mockDynamoQuery(...params)),
      putItem: jest.fn((...params) => mockDynamoPutItem(...params))
    })
  }
})

describe('S3Cache', () => {
  afterEach(() => {
    jest.clearAllMocks()
    store.clear()
  })
  afterAll(() => {
    jest.restoreAllMocks()
  })

  it('get should return null', async () => {
    const result = await s3Cache.get()
    expect(result).toBeNull()
  })

  it('should not write cache for redirect entry', async () => {
    await s3Cache.set(cacheKey, cacheKey, { value: mockRedirectCacheEntry, lastModified: 0 }, mockCacheContext)

    expect(s3Cache.client.putObject).not.toHaveBeenCalled()
    expect(mockDynamoPutItem).not.toHaveBeenCalled()
  })

  it('should not write cache if revalidate is 0', async () => {
    await s3Cache.set(
      cacheKey,
      cacheKey,
      { value: mockPageCacheEntry, lastModified: 0, revalidate: 0 },
      mockCacheContext
    )

    expect(s3Cache.client.putObject).not.toHaveBeenCalled()
    expect(mockDynamoPutItem).not.toHaveBeenCalled()
  })

  it('should not write cache if value is null', async () => {
    await s3Cache.set(cacheKey, cacheKey, { value: null, lastModified: 0 }, mockCacheContext)

    expect(s3Cache.client.putObject).not.toHaveBeenCalled()
    expect(mockDynamoPutItem).not.toHaveBeenCalled()
  })

  it(`should write value for ${CachedRouteKind.APP_PAGE}`, async () => {
    await s3Cache.set(
      cacheKey,
      cacheKey,
      { value: mockAppPageCacheEntry, lastModified: 0, revalidate: mockRevalidate },
      mockCacheContext
    )

    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(2)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.html`,
      Body: mockHtmlPage,
      ContentType: 'text/html',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.rsc`,
      Body: mockAppPageCacheEntry.rscData?.toString(),
      ContentType: 'text/x-component',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(mockDynamoPutItem).toHaveBeenCalledWith({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      Item: {
        pageKey: { S: cacheKey },
        cacheKey: { S: cacheKey },
        s3Key: { S: `${cacheKey}/${cacheKey}` },
        tags: { S: '' },
        createdAt: { S: expect.any(String) }
      }
    })
  })

  it(`should write value for ${CachedRouteKind.FETCH}`, async () => {
    await s3Cache.set(
      cacheKey,
      cacheKey,
      { value: mockFetchCacheEntry, lastModified: 0, revalidate: mockRevalidate },
      mockCacheContext
    )

    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(1)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`,
      Body: mockFetchCacheEntry.data.body,
      ContentType: 'application/json',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(mockDynamoPutItem).toHaveBeenCalledWith({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      Item: {
        pageKey: { S: cacheKey },
        cacheKey: { S: cacheKey },
        s3Key: { S: `${cacheKey}/${cacheKey}` },
        tags: { S: '' },
        createdAt: { S: expect.any(String) }
      }
    })
  })

  it(`should write value for ${CachedRouteKind.APP_ROUTE}`, async () => {
    await s3Cache.set(
      cacheKey,
      cacheKey,
      { value: mockAppRouteCacheEntry, lastModified: 0, revalidate: mockRevalidate },
      mockCacheContext
    )

    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(1)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`,
      Body: mockAppRouteCacheEntry.body.toString(),
      ContentType: 'application/json',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(mockDynamoPutItem).toHaveBeenCalledWith({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      Item: {
        pageKey: { S: cacheKey },
        cacheKey: { S: cacheKey },
        s3Key: { S: `${cacheKey}/${cacheKey}` },
        tags: { S: '' },
        createdAt: { S: expect.any(String) }
      }
    })
  })

  it(`should write value for ${CachedRouteKind.ROUTE}`, async () => {
    await s3Cache.set(
      cacheKey,
      cacheKey,
      { value: mockRouteCacheEntry, lastModified: 0, revalidate: mockRevalidate },
      mockCacheContext
    )

    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(1)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`,
      Body: mockRouteCacheEntry.body.toString(),
      ContentType: 'application/json',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(mockDynamoPutItem).toHaveBeenCalledWith({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      Item: {
        pageKey: { S: cacheKey },
        cacheKey: { S: cacheKey },
        s3Key: { S: `${cacheKey}/${cacheKey}` },
        tags: { S: '' },
        createdAt: { S: expect.any(String) }
      }
    })
  })

  it(`should write value for ${CachedRouteKind.PAGE} with page router`, async () => {
    const pageData = { value: mockPageCacheEntry, lastModified: 0, revalidate: mockRevalidate }
    await s3Cache.set(cacheKey, cacheKey, pageData, mockCacheContext)

    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(2)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.html`,
      Body: mockHtmlPage,
      ContentType: 'text/html',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.json`,
      Body: JSON.stringify(pageData),
      ContentType: 'application/json',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(mockDynamoPutItem).toHaveBeenCalledWith({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      Item: {
        pageKey: { S: cacheKey },
        cacheKey: { S: cacheKey },
        s3Key: { S: `${cacheKey}/${cacheKey}` },
        tags: { S: '' },
        createdAt: { S: expect.any(String) }
      }
    })
  })

  it(`should write value for ${CachedRouteKind.PAGE} with app router`, async () => {
    await s3Cache.set(
      cacheKey,
      cacheKey,
      { value: mockPageCacheEntry, lastModified: 0, revalidate: mockRevalidate },
      { ...mockCacheContext, isAppRouter: true }
    )

    expect(s3Cache.client.putObject).toHaveBeenCalledTimes(2)
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.html`,
      Body: mockHtmlPage,
      ContentType: 'text/html',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(s3Cache.client.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: mockBucketName,
      Key: `${cacheKey}/${cacheKey}.rsc`,
      Body: mockPageCacheEntry.pageData,
      ContentType: 'text/x-component',
      CacheControl: mockCacheControlRevalidateHeader,
      Metadata: {
        'Cache-Fragment-Key': cacheKey
      }
    })
    expect(mockDynamoPutItem).toHaveBeenCalledWith({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      Item: {
        pageKey: { S: cacheKey },
        cacheKey: { S: cacheKey },
        s3Key: { S: `${cacheKey}/${cacheKey}` },
        tags: { S: '' },
        createdAt: { S: expect.any(String) }
      }
    })
  })

  it('should delete cache value', async () => {
    await s3Cache.delete(cacheKey, cacheKey)
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

  it('should revalidate cache by tag and delete objects', async () => {
    const s3Path = `${pageKey}/${cacheKey}`
    const mockQueryResult = {
      Items: [
        {
          pageKey: { S: pageKey },
          cacheKey: { S: cacheKey }
        }
      ]
    }

    mockDynamoQuery.mockResolvedValueOnce(mockQueryResult)
    mockGetObjectTagging.mockResolvedValue({ TagSet: [{ Key: TAG_PREFIX, Value: 'test-tag' }] })
    mockGetObjectList.mockResolvedValueOnce({
      Contents: [{ Key: s3Path + '.json' }, { Key: s3Path + '.html' }, { Key: s3Path + '.rsc' }]
    })

    await s3Cache.revalidateTag('test-tag')

    expect(mockDynamoQuery).toHaveBeenCalledWith({
      TableName: process.env.DYNAMODB_CACHE_TABLE,
      KeyConditionExpression: '#field = :value',
      ExpressionAttributeNames: {
        '#field': 'tags'
      },
      ExpressionAttributeValues: {
        ':value': { S: 'test-tag' }
      }
    })

    expect(s3Cache.client.deleteObjects).toHaveBeenCalledWith({
      Bucket: mockBucketName,
      Delete: {
        Objects: [{ Key: s3Path + '.json' }, { Key: s3Path + '.html' }, { Key: s3Path + '.rsc' }]
      }
    })
  })

  it('should revalidate cache by path', async () => {
    const s3Path = `${pageKey}/${cacheKey}`
    mockGetObjectList.mockResolvedValueOnce({
      Contents: [{ Key: s3Path + '.json' }, { Key: s3Path + '.html' }, { Key: s3Path + '.rsc' }]
    })

    await s3Cache.deleteAllByKeyMatch(cacheKey, '')

    expect(s3Cache.client.listObjectsV2).toHaveBeenCalledWith({
      Bucket: mockBucketName,
      ContinuationToken: undefined,
      Prefix: `${cacheKey}/`,
      Delimiter: '/'
    })

    expect(s3Cache.client.deleteObjects).toHaveBeenCalledWith({
      Bucket: mockBucketName,
      Delete: {
        Objects: [{ Key: s3Path + '.json' }, { Key: s3Path + '.html' }, { Key: s3Path + '.rsc' }]
      }
    })
  })
})
