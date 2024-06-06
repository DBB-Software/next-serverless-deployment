import { Cache, NextCacheHandlerContext } from '@dbbs/next-cache-handler-core'
import { S3Cache } from '@dbbs/next-cache-handler-s3'

class ServerlessCache extends Cache {
  constructor(props: NextCacheHandlerContext) {
    super(props)
  }
}

ServerlessCache.setCacheStrategy(new S3Cache(process.env.STATIC_BUCKET_NAME!))

export default Cache
