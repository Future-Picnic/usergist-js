#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
const root = resolve(process.argv[2])
const require = createRequire(join(root, 'package.json'))
const app = JSON.parse(readFileSync(join(root, 'app.json'))).expo
const sdk = join(root, 'node_modules/@usergist/feedback-react-native')
const manifest = JSON.parse(readFileSync(join(sdk, 'package.json')))
assert.equal(manifest.codegenConfig, undefined)
const options = app.plugins.find(p => Array.isArray(p) && p[0] === manifest.name)[1].push
const extension = options.ios.extensionTargetName || 'UserGistNotificationServiceExtension'
const targets = v => typeof v === 'string' ? [v] : Object.values(v).flatMap(targets)
for (const target of targets(manifest.exports)) assert.ok(existsSync(join(sdk, target)), `Missing package export: ${target}`)
for (const file of ['plugin/index.cjs', 'plugin/templates/UserGistExpoMessagingService.kt', 'expo-module.config.json', 'expo-support/UserGistExpoAppDelegateSubscriber.swift', 'ios/Shared/UserGistPushState.swift', 'ios/Extension/UserGistNotificationService.swift']) assert.ok(existsSync(join(sdk, file)), `Missing native input ${file}`)
assert.equal(typeof require('@usergist/feedback-react-native/app.plugin.js'), 'function')
const xcode = require('xcode')
const project = xcode.project(join(root, 'ios/UserGistExpoFixture.xcodeproj/project.pbxproj')).parseSync()
const targetEntries = Object.entries(project.pbxNativeTargetSection()).filter(([k, v]) => !k.endsWith('_comment') && String(v.name).replaceAll('"', '') === extension)
assert.equal(targetEntries.length, 1, 'Exactly one notification extension')
const [targetId] = targetEntries[0]
assert.ok(project.getFirstTarget().firstTarget.dependencies.some(ref => project.hash.project.objects.PBXTargetDependency[ref.value]?.target === targetId), 'The app must depend on its embedded extension')
const sourceFiles = Object.values(project.pbxFileReferenceSection()).filter(ref => ref && typeof ref === 'object' && String(ref.path).includes('NotificationService.swift'))
assert.equal(sourceFiles.length, 1)
assert.equal(String(sourceFiles[0].path).replaceAll('"', ''), 'NotificationService.swift')
const podfile = readFileSync(join(root, 'ios/Podfile'), 'utf8')
assert.equal(podfile.split(`target '${extension}'`).length - 1, 1)
const android = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8')
assert.match(android, /UserGistPushMode/)
const mode = options.mode
if (mode === 'expo-notifications') {
  assert.match(android, /UserGistExpoMessagingService/)
  assert.ok(existsSync(join(root, 'android/app/src/main/java/studio/usergist/feedback/expo/UserGistExpoMessagingService.kt')))
}
console.log('Expo archive and generated native configuration verified:', root)
