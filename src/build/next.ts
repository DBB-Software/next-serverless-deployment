import childProcess from 'node:child_process'
import { ProjectPackager } from '../common/project'

const setNextOptions = () => {
  // Same as `target: "standalone"` in next.config.js
  process.env.NEXT_PRIVATE_STANDALONE = 'true'
}

export const buildNextApp = (packager: ProjectPackager) => {
  setNextOptions()
  childProcess.execSync(packager.buildCommand, { stdio: 'inherit' })
}
