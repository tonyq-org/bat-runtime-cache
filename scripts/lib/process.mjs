import { spawn } from 'node:child_process'

export async function spawnFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    child.stdout?.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr?.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        })
        return
      }
      reject(new Error(
        `${command} ${args.join(' ')} failed code=${code} signal=${signal}\n` +
        Buffer.concat(stderr).toString('utf8'),
      ))
    })
  })
}
