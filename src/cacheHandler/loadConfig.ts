import fs from 'node:fs'
import path from 'node:path'

interface CacheConfig {
  noCacheRoutes?: string[]
  cacheCookies?: string[]
  cacheQueries?: string[]
  enableDeviceSplit?: boolean
}

const SERVERLESS_CONFIG = 'next-serverless.config.json'

function loadConfig(): CacheConfig | null {
  try {
    const configPath = path.resolve(process.cwd(), SERVERLESS_CONFIG)
    if (!fs.existsSync(configPath)) {
      console.error(`Configuration file next-serverless.config.json was not found at: ${configPath}`)
      return null
    }
    const configData = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(configData) as CacheConfig
  } catch (e) {
    console.error(e)
    return null
  }
}

export default loadConfig
