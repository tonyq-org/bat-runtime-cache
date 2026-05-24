#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const catalogPath = process.argv.slice(2).find(arg => arg !== '--')
if (!catalogPath) {
  console.error('usage: pnpm run verify:catalog -- <catalog.json>')
  process.exit(1)
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const errors = []

if (catalog.schemaVersion !== 1) errors.push('schemaVersion must be 1')
if (!catalog.generatedAt) errors.push('generatedAt is required')
if (!catalog.runtimes || typeof catalog.runtimes !== 'object') errors.push('runtimes object is required')

for (const [runtimeName, runtime] of Object.entries(catalog.runtimes || {})) {
  if (runtime.tool !== runtimeName) errors.push(`${runtimeName}: tool must match runtime key`)
  if (!runtime.version) errors.push(`${runtimeName}: version is required`)
  for (const [platformName, platform] of Object.entries(runtime.platforms || {})) {
    const label = `${runtimeName}.${platformName}`
    if (platform.platform !== platformName) errors.push(`${label}: platform must match key`)
    if (platform.archiveType !== 'tar.gz') errors.push(`${label}: archiveType must be tar.gz`)
    if (!/^https:\/\/github\.com\/tonyq-org\/bat-runtime-cache\/releases\/download\//.test(platform.url || '')) {
      errors.push(`${label}: url must point at the runtime cache release assets`)
    }
    if (!/^[a-f0-9]{64}$/.test(platform.sha256 || '')) errors.push(`${label}: sha256 must be lowercase hex`)
    if (!Number.isInteger(platform.sizeBytes) || platform.sizeBytes <= 0) errors.push(`${label}: sizeBytes must be positive`)
    if (!platform.installRoot) errors.push(`${label}: installRoot is required`)
    if (!platform.executables?.codex) errors.push(`${label}: executables.codex is required`)
    if (!platform.versionCheck?.command?.length) errors.push(`${label}: versionCheck.command is required`)
    if (!platform.versionCheck?.expectedStdout) errors.push(`${label}: versionCheck.expectedStdout is required`)
  }
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`catalog ok: ${catalogPath}`)
