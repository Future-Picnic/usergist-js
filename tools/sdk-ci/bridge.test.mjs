import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { affected, selected, validateEntry, sanitizeManifest, snapshot, matchingRun, resultState } from '../../sdk-mirrors/js/tools/sdk-ci/bridge.mjs'

test('only SDK families affected by changes are scheduled; renames can check both old and new paths', () => {
  assert.equal(affected(['apps/dashboard/page.tsx'], 'js'), false)
  assert.equal(affected(['packages/sdk-web/src/client.ts'], 'js'), true)
  assert.equal(affected(['pnpm-lock.yaml'], 'js'), true)
  assert.equal(affected(['pnpm-lock.yaml'], 'ios'), false)
  assert.equal(affected(['packages/sdk-ios/old.swift', 'packages/sdk-android/new.kt'], 'ios'), true)
  assert.equal(affected(['sdk-mirrors/js/tools/sdk-ci/bridge.mjs'], 'flutter'), true)
  assert.equal(selected('apps/api/.env', 'js'), false)
})
test('snapshot rejects symlinks, credentials and workflows inside SDK folders', () => {
  for (const path of ['packages/sdk-core/.env.local', 'packages/sdk-ios/key.p8', 'packages/sdk-web/.github/workflows/leak.yml']) assert.throws(() => validateEntry({ mode: '100644', path }))
  assert.throws(() => validateEntry({ mode: '120000', path: 'packages/sdk-core/src/link' }))
  assert.doesNotThrow(() => validateEntry({ mode: '100755', path: 'packages/sdk-android/gradlew' }))
})
test('root manifest drops private app commands, workspace paths and install scripts', () => {
  const safe = JSON.parse(sanitizeManifest(JSON.stringify({ scripts: { postinstall: 'private secret' }, workspaces: ['apps/*'], devDependencies: { typescript: '5' }, packageManager: 'pnpm@9.0.0' })))
  assert.equal(safe.scripts, undefined)
  assert.equal(safe.workspaces, undefined)
  assert.equal(safe.devDependencies.typescript, '5')
})
test('only the exact snapshot with the current trusted workflow can pass', () => {
  const base = { id: 1, head_sha: 'workflow', event: 'workflow_dispatch', display_title: 'SDK snapshot abc', status: 'completed', conclusion: 'success' }
  assert.equal(matchingRun([{ ...base, head_sha: 'old' }, { ...base, display_title: 'SDK snapshot different' }, { ...base, event: 'push' }], 'abc', 'workflow'), undefined)
  assert.equal(resultState(base), 'success')
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral']) assert.equal(resultState({ ...base, conclusion }), 'failure')
  assert.equal(resultState({ ...base, status: 'in_progress' }), 'pending')
  assert.equal(matchingRun([base, { ...base, id: 2, conclusion: 'failure' }], 'abc', 'workflow').id, 2)
})
test('public commit contains only selected SDK files, no private parents, and is reusable for identical SDK content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-bridge-test-'))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid')
  mkdirSync(join(dir, 'packages/sdk-core/src'), { recursive: true }); mkdirSync(join(dir, 'apps/api'), { recursive: true })
  writeFileSync(join(dir, 'packages/sdk-core/src/index.ts'), 'export const sdk = true\n')
  writeFileSync(join(dir, 'apps/api/private.ts'), 'PRIVATE SERVER\n')
  writeFileSync(join(dir, 'package.json'), '{"scripts":{"postinstall":"private"},"devDependencies":{}}')
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages: ['apps/*', 'packages/*']\n")
  git('add', '.'); git('commit', '-qm', 'Private commit message')
  const first = snapshot(join(dir, '.git'), git('rev-parse', 'HEAD'), 'js', process.env)
  const paths = git('ls-tree', '-r', '--name-only', first).split('\n')
  assert.deepEqual(paths, ['package.json', 'packages/sdk-core/src/index.ts', 'pnpm-workspace.yaml'])
  assert.equal(git('rev-list', '--parents', '-n', '1', first), first)
  assert.equal(git('show', '-s', '--format=%B', first), 'SDK validation snapshot')
  writeFileSync(join(dir, 'apps/api/private.ts'), 'PRIVATE CHANGE\n'); git('add', '.'); git('commit', '-qm', 'Another private message')
  assert.equal(snapshot(join(dir, '.git'), git('rev-parse', 'HEAD'), 'js', process.env), first)
})
