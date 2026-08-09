import process, { argv, env } from "node:process"
import { spawn } from "node:child_process"

// Set your custom env variables here
const extenv = {
    NODE_ENV: argv[2],
}

const command = argv[3]
if (!command) {
  throw new Error('Missing command to run')
}

const child = spawn(command, argv.slice(4), {
  env: {
    ...env,
    ...extenv
  },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
})
