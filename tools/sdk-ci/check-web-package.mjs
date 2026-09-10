#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const dir = resolve(process.argv[2])
const archive = prefix => {
  const matches = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.tgz'))
  assert.equal(matches.length, 1, `Expected one ${prefix} archive`)
  return join(dir, matches[0])
}
const web = archive('usergist-feedback-web-')
const core = archive('usergist-sdk-core-')
const files = execFileSync('tar', ['-tzf', web], { encoding: 'utf8' }).split('\n')
for (const file of ['index.js', 'index.cjs', 'index.d.ts', 'react.js', 'react.d.ts', 'preview.js', 'preview.d.ts', 'usergist.global.js']) {
  assert.ok(files.includes(`package/dist/${file}`), `Missing Web entry ${file}`)
}
const consumer = mkdtempSync(join(tmpdir(), 'usergist-web-ci-'))
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'web-package-consumer', private: true, type: 'module' }))
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', core, web, 'react@18.3.1'], { cwd: consumer, stdio: 'inherit' })
execFileSync(process.execPath, ['--input-type=module', '-e', `
  await import('@usergist/feedback-web');
  await import('@usergist/feedback-web/react');
  await import('@usergist/feedback-web/preview');
  const { createRequire } = await import('node:module');
  createRequire(import.meta.url)('@usergist/feedback-web');
`], { cwd: consumer, stdio: 'inherit' })
console.log('Web archive files and isolated ESM/CJS/React/preview imports passed.')
