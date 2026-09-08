#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const root = resolve(process.argv[2])
const appFile = join(root, 'app.json')
const original = readFileSync(appFile, 'utf8')
const app = JSON.parse(original)
const options = app.expo.plugins.find(p => Array.isArray(p) && p[0] === '@usergist/feedback-react-native')[1]
const version = JSON.parse(readFileSync(join(root, 'node_modules/expo/package.json'))).version
const run = platform => spawnSync(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--no-install', '--platform', platform, ...(version.startsWith('57.') ? ['--no-clean'] : [])], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1' } })
const manifest = join(root, 'android/app/src/main/AndroidManifest.xml')
const android = readFileSync(manifest, 'utf8')
if (options.push.mode === 'expo-notifications') {
  try {
    const iosOnly = JSON.parse(original)
    iosOnly.expo.platforms = ['ios']
    iosOnly.expo.plugins = iosOnly.expo.plugins.filter(plugin => plugin !== 'expo-notifications')
    iosOnly.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === '@usergist/feedback-react-native')[1].push.mode = 'automatic'
    writeFileSync(appFile, JSON.stringify(iosOnly))
    const result = run('ios')
    assert.notEqual(result.status, 0)
    assert.match(result.stdout + result.stderr, /expo-notifications is installed/)
  } finally { writeFileSync(appFile, original) }
}
try {
  writeFileSync(manifest, android.replace('</application>', '<service android:name="com.example.HostMessagingService" android:exported="false"><intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter></service></application>'))
  const result = run('android')
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /Custom FCM service com.example.HostMessagingService/)
} finally { writeFileSync(manifest, android) }

const target = options.push.ios.extensionTargetName || 'UserGistNotificationServiceExtension'
const swift = join(root, 'ios', target, 'NotificationService.swift')
const extension = readFileSync(swift, 'utf8')
try {
  writeFileSync(swift, '// Existing customer notification extension\n')
  const result = run('ios')
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /already exists and is not owned by UserGist/)
} finally { writeFileSync(swift, extension) }

try {
  app.expo.ios.infoPlist = { UIBackgroundModes: ['audio'], CustomerSetting: 'preserved' }
  app.expo.ios.associatedDomains = ['applinks:example.com']
  writeFileSync(appFile, JSON.stringify(app))
  const result = run('ios')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const info = readFileSync(join(root, 'ios/UserGistExpoFixture/Info.plist'), 'utf8')
  const entitlements = readFileSync(join(root, 'ios/UserGistExpoFixture/UserGistExpoFixture.entitlements'), 'utf8')
  assert.match(info, /CustomerSetting/)
  assert.match(info, /<string>audio<\/string>/)
  assert.match(info, /<string>remote-notification<\/string>/)
  assert.match(entitlements, /applinks:example.com/)
  assert.match(entitlements, new RegExp(`<string>${options.push.ios.apsEnvironment}</string>`))
} finally { writeFileSync(appFile, original) }
try {
  const image = join(root, 'assets/usergist-notification-test.png')
  const installed = join(root, 'android/app/src/main/res/drawable/usergist_notification_icon.png')
  options.push.android = { notificationIcon: './assets/usergist-notification-test.png', notificationColor: '#3366FF' }
  writeFileSync(appFile, JSON.stringify(app))
  for (const density of ['mdpi', 'hdpi']) {
    const bytes = readFileSync(join(root, `android/app/src/main/res/drawable-${density}/splashscreen_logo.png`))
    writeFileSync(image, bytes)
    const result = run('android')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.deepEqual(readFileSync(installed), bytes, 'Owned notification resources must update on prebuild')
  }
} finally { writeFileSync(appFile, original) }
console.log('Existing native configuration is preserved; foreign push ownership fails explicitly.')
