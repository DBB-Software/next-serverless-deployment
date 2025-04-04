import { buildSync, type BuildOptions } from 'esbuild'
import path from 'node:path'

export const buildLambda = (name: string, outDir: string, options?: BuildOptions) => {
  const resultedFile = path.join(outDir, 'server-functions', name, 'index.js')
  const res = buildSync({
    target: 'es2022',
    format: 'cjs',
    platform: 'node',
    bundle: true,
    minify: true,
    external: ['node:*', 'next', '@aws-sdk/*'],
    entryPoints: [path.join(__dirname, '..', 'lambdas', `${name}.js`)],
    outfile: resultedFile,
    ...options
  })

  if (res.errors?.length > 0) {
    res.errors.forEach((err) => console.error('Build lambda error:', err))

    throw new Error('Error during building lambda function')
  }

  return resultedFile
}

export const buildRevalidateServer = (name: string, outDir: string, options?: BuildOptions) => {
  const resultedFile = path.join(outDir, 'next-handlers', `${name}.js`)

  const res = buildSync({
    target: 'es2022',
    format: 'cjs',
    platform: 'node',
    bundle: true,
    minify: true,
    entryPoints: [path.join(__dirname, '..', 'build', 'cache', `${name}.js`)],
    outfile: resultedFile,
    ...options
  })

  if (res.errors?.length > 0) {
    res.errors.forEach((err) => console.error('Build lambda error:', err))

    throw new Error('Error during building lambda function')
  }

  return resultedFile
}
