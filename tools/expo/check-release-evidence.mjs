#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

// Evidence is supplied externally so recording an archive hash does not change
// that archive. Build fixtures and unsigned builds never count as device tests.
const archive = process.argv[2]
assert.ok(archive, 'Pass the exact archive to be published')
const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
if (manifest.name !== '@usergist/feedback-react-native') throw new Error('Expected the React Native SDK archive')
const evidence = JSON.parse(process.env.USERGIST_EXPO_RELEASE_EVIDENCE || 'null')
assert.ok(evidence, 'Expo publication is blocked: supply USERGIST_EXPO_RELEASE_EVIDENCE after the native build gates pass')
assert.equal(evidence.version, manifest.version, 'Evidence must describe this package version')
assert.equal(evidence.archiveSha256, createHash('sha256').update(readFileSync(archive)).digest('hex'), 'Evidence must describe these exact archive bytes')
assert.match(evidence.sourceCommit || '', /^[a-f0-9]{40}$/, 'Record the source commit')
const passed = (name, entries) => {
  const entry = entries?.find(e => e.name === name)
  assert.ok(entry?.passed === true && /^https:\/\//.test(entry.evidenceUrl || ''), `Missing passing evidence: ${name}`)
}
for (const sdk of ['56.0.21', '57.0.20']) {
  for (const platform of ['ios', 'android']) {
    for (const mode of ['automatic', 'expo-notifications']) passed(`${sdk}/${platform}/${mode}`, evidence.nativeBuilds)
  }
}
for (const name of ['package', 'prebuild', 'react-native-ios', 'react-native-android']) passed(name, evidence.regressions)
if (!manifest.version.includes('-')) {
  for (const platform of ['ios', 'android']) {
    for (const name of ['core-journeys', 'identity-offline', 'consent', 'real-push', 'coexistence', 'durable-receipts']) passed(`${platform}/${name}`, evidence.physicalDevices)
  }
  passed('ios/development-signing', evidence.physicalDevices)
  passed('ios/production-signing', evidence.physicalDevices)
}
console.log(`Publication evidence verified for ${manifest.version}`)
