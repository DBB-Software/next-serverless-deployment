import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILE_NAME = 'next-serverless.config.js'
const CONFIG_TEMPLATE = `/**
 * @type {import('@dbbs/next-serverless-deployment/dist/types').CacheConfig}
 */
const config = {
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
