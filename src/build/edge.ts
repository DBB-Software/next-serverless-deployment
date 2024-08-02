import { buildSync, type BuildOptions } from 'esbuild'
import path from 'node:path'

export const buildLambda = (names: string[], outDir: string, options?: BuildOptions) => {
  const res = buildSync({
    target: 'es2022',
    format: 'cjs',
    platform: 'node',
    bundle: true,
    minify: true,
    external: ['node:*', 'next', '@aws-sdk/*'],
    entryPoints: names.map((name) => path.join(__dirname, '..', 'lambdas', `${name}.js`)),
    outdir: path.join(outDir, 'server-functions'),
    ...options
  })

  if (res.errors?.length > 0) {
    res.errors.forEach((err) => console.error('Build lambda error:', err))

    throw new Error('Error during building lambda function')
  }
}
