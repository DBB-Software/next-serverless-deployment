import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILE_NAME = 'next-serverless.config.ts'
const CONFIG_TEMPLATE = `import { CacheConfig } from 'next-serverless-deployment'
const config: CacheConfig = {
  noCacheRoutes: [],
  cacheCookies: [],
  cacheQueries: [],
  enableDeviceSplit: false
}

module.exports = config
`

export const createConfigFile = () => {
  const configFilePath = path.resolve(process.cwd(), CONFIG_FILE_NAME)

  if (!fs.existsSync(configFilePath)) {
    fs.writeFileSync(configFilePath, CONFIG_TEMPLATE, 'utf-8')
    console.log(`Created sample configuration file at ${configFilePath}`)
  } else {
    console.log(`Configuration file already exists at ${configFilePath}`)
  }
}
