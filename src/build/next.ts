import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { type ProjectPackager } from '../common/project'

interface BuildOptions {
  packager: ProjectPackager
  nextConfigPath: string
  s3BucketName: string
}

const setNextOptions = async (nextConfig: string, s3BucketName: string) => {
  // set s3 bucket name for cache handler during build time
  process.env.STATIC_BUCKET_NAME = s3BucketName

  const currentConfig = await import(nextConfig).then((r) => r.default)
  const updatedConfig = {
    ...currentConfig,
    output: 'standalone',
    cacheHandler: require.resolve(path.join('..', 'cacheHandler', 'index.js'))
  }

  const currentContent = fs.readFileSync(nextConfig, 'utf-8')

  fs.writeFileSync(nextConfig, `module.exports = ${JSON.stringify(updatedConfig, null, 4)};\n`, 'utf-8')

  // function to revert back to original content of file.
  return () => {
    fs.writeFileSync(nextConfig, currentContent, 'utf-8')
  }
}

export const buildNextApp = async (options: BuildOptions) => {
  const { packager, nextConfigPath, s3BucketName } = options

  const clearNextConfig = await setNextOptions(nextConfigPath, s3BucketName)
  childProcess.execSync(packager.buildCommand, { stdio: 'inherit' })

  // Reverts changes to next project
  return clearNextConfig
}
