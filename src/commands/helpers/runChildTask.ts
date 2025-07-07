import childProcess from 'node:child_process'

const runChildTask = (command: string, env: NodeJS.ProcessEnv) => {
  const task = childProcess.spawn(command, {
    env,
    shell: true,
    stdio: 'pipe'
  })

  task.stdout.on('data', (data: Buffer) => {
    console.debug(data.toString())
  })
  task.stderr.on('data', (data: Buffer) => {
    console.debug(data.toString())
  })
  task.on('exit', (code) => {
    console.debug('Bootstrapping CDK exited with code', code)
  })
}

export default runChildTask
