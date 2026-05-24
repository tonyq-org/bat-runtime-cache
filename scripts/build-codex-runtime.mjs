#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { spawnFile } from './lib/process.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const platforms = {
  'darwin-arm64': {
    npmVersionSuffix: 'darwin-arm64',
    triple: 'aarch64-apple-darwin',
    exe: 'codex',
    rg: 'rg',
  },
  'darwin-x64': {
    npmVersionSuffix: 'darwin-x64',
    triple: 'x86_64-apple-darwin',
    exe: 'codex',
    rg: 'rg',
  },
  'linux-arm64': {
    npmVersionSuffix: 'linux-arm64',
    triple: 'aarch64-unknown-linux-musl',
    exe: 'codex',
    rg: 'rg',
  },
  'linux-x64': {
    npmVersionSuffix: 'linux-x64',
    triple: 'x86_64-unknown-linux-musl',
    exe: 'codex',
    rg: 'rg',
  },
  'win32-arm64': {
    npmVersionSuffix: 'win32-arm64',
    triple: 'aarch64-pc-windows-msvc',
    exe: 'codex.exe',
    rg: 'rg.exe',
  },
  'win32-x64': {
    npmVersionSuffix: 'win32-x64',
    triple: 'x86_64-pc-windows-msvc',
    exe: 'codex.exe',
    rg: 'rg.exe',
  },
}

function argValue(name, fallback = undefined) {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index >= 0) return process.argv[index + 1]
  return fallback
}

function releaseBaseUrl(version) {
  return `https://github.com/tonyq-org/bat-runtime-cache/releases/download/codex-${version}`
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'bat-runtime-cache',
    },
  })
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function download(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'bat-runtime-cache',
    },
  })
  if (!response.ok || !response.body) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`)
  }
  await pipeline(response.body, createWriteStream(outputPath))
}

async function sha256(path) {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex')
}

async function firstExistingFile(paths, label) {
  for (const path of paths) {
    try {
      const info = await stat(path)
      if (info.isFile()) return path
    } catch {
      // Try the next package layout.
    }
  }
  throw new Error(`${label} missing; tried:\n${paths.map(path => `  - ${path}`).join('\n')}`)
}

async function packagePlatform({ version, platform, outputDir }) {
  const spec = platforms[platform]
  const packageVersion = `${version}-${spec.npmVersionSuffix}`
  const metadata = await fetchJson(`https://registry.npmjs.org/@openai%2Fcodex/${packageVersion}`)
  const tarballUrl = metadata?.dist?.tarball
  if (!tarballUrl) throw new Error(`missing npm tarball for @openai/codex@${packageVersion}`)

  const workDir = await mkdtemp(join(tmpdir(), `bat-codex-${platform}-`))
  const packageTgz = join(workDir, 'package.tgz')
  const extractDir = join(workDir, 'extract')
  const runtimeDir = join(workDir, `codex-${version}-${platform}`)

  await download(tarballUrl, packageTgz)
  await mkdir(extractDir, { recursive: true })
  await spawnFile('tar', ['-xzf', packageTgz, '-C', extractDir])

  const vendorRoot = join(extractDir, 'package', 'vendor', spec.triple)
  const sourceCodex = await firstExistingFile([
    join(vendorRoot, 'bin', spec.exe),
    join(vendorRoot, 'codex', spec.exe),
  ], 'Codex executable')
  const sourceRipgrep = await firstExistingFile([
    join(vendorRoot, 'codex-path', spec.rg),
    join(vendorRoot, 'path', spec.rg),
  ], 'Codex ripgrep executable')

  await mkdir(join(runtimeDir, 'path'), { recursive: true })
  const targetCodex = join(runtimeDir, spec.exe)
  const targetRipgrep = join(runtimeDir, 'path', spec.rg)
  await copyFile(sourceCodex, targetCodex)
  await copyFile(sourceRipgrep, targetRipgrep)
  if (!platform.startsWith('win32-')) {
    await chmod(targetCodex, 0o755)
    await chmod(targetRipgrep, 0o755)
  }
  await writeFile(join(runtimeDir, 'runtime.json'), JSON.stringify({
    tool: 'codex',
    version,
    platform,
    source: `@openai/codex@${packageVersion}`,
    generatedAt: new Date().toISOString(),
  }, null, 2) + '\n')

  const archiveName = `codex-${version}-${platform}.tar.gz`
  const archivePath = join(outputDir, archiveName)
  await spawnFile('tar', ['-czf', archivePath, '-C', workDir, basename(runtimeDir)])
  const digest = await sha256(archivePath)
  const sizeBytes = (await stat(archivePath)).size
  await rm(workDir, { recursive: true, force: true })

  return {
    platform,
    archiveName,
    archivePath,
    sha256: digest,
    sizeBytes,
    exe: spec.exe,
    rg: spec.rg,
  }
}

async function main() {
  const version = argValue('--version')
  if (!version) {
    throw new Error('usage: pnpm run build:codex -- --version <codex-version> [--platform <platform>]')
  }
  const requestedPlatform = argValue('--platform')
  if (requestedPlatform && !platforms[requestedPlatform]) {
    throw new Error(`unsupported platform: ${requestedPlatform}`)
  }
  const selectedPlatforms = requestedPlatform ? [requestedPlatform] : Object.keys(platforms)

  const outputDir = join(repoRoot, 'dist', 'codex', version)
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const results = []
  for (const platform of selectedPlatforms) {
    console.log(`[build-codex-runtime] building ${version} ${platform}`)
    results.push(await packagePlatform({ version, platform, outputDir }))
  }

  const shasums = results
    .map(result => `${result.sha256}  ${result.archiveName}`)
    .sort()
    .join('\n') + '\n'
  await writeFile(join(outputDir, 'SHASUMS256.txt'), shasums)

  const releaseUrl = releaseBaseUrl(version)
  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtimes: {
      codex: {
        tool: 'codex',
        version,
        platforms: Object.fromEntries(results.map(result => [
          result.platform,
          {
            platform: result.platform,
            archiveType: 'tar.gz',
            url: `${releaseUrl}/${result.archiveName}`,
            sha256: result.sha256,
            sizeBytes: result.sizeBytes,
            installRoot: `codex/${version}/${result.platform}`,
            executables: {
              codex: result.exe,
              ripgrep: `path/${result.rg}`,
            },
            versionCheck: {
              command: [result.exe, '--version'],
              expectedStdout: `codex-cli ${version}`,
            },
          },
        ])),
      },
    },
  }

  const catalogPath = join(outputDir, `runtimes.codex-${version}.json`)
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
  console.log(`[build-codex-runtime] wrote ${outputDir}`)
}

main().catch(err => {
  console.error(`[build-codex-runtime] failed: ${err?.stack || err}`)
  process.exit(1)
})
