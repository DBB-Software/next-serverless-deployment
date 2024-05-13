import fs from 'node:fs'
import childProcess from 'node:child_process'

const setNextOptions = () => {
  // Same as `target: "standalone"` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = 'true'
}

const getPackager = () => {
  return (
    [
      { lockFile: 'package-lock.json', packager: 'npm' },
      { lockFile: 'yarn.lock', packager: 'yarn' },
      { lockFile: 'pnpm-lock.yaml', packager: 'pnpm' }
    ].find((packager) => fs.existsSync(`./${packager.lockFile}`))?.packager ?? 'npm'
  )
}

const buildNextApp = (packager: string) => {
  const command = packager === 'npm' ? 'npm run build' : `${packager} build`

  childProcess.execSync(command, { stdio: 'inherit' })
}

export const buildApp = () => {
  const packager = getPackager()
  setNextOptions()
  buildNextApp(packager)
}
