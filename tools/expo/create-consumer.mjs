#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const major = process.argv[2] || '57'
const mode = process.argv[3] || 'automatic'
if (!['56', '57'].includes(major) || !['automatic', 'expo-notifications'].includes(mode)) throw new Error('Usage: create-consumer.mjs <56|57> <automatic|expo-notifications> [archive]')
const root = mkdtempSync(join(tmpdir(), `usergist-expo-${major}-${mode}-`))
console.log(`Expo consumer retained: ${root}`)
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } })
let archive = process.argv[4] && resolve(process.argv[4])
if (!archive) {
  run('pnpm', ['--filter', '@usergist/sdk-core', 'build'], repo)
  run('pnpm', ['pack', '--pack-destination', root], join(repo, 'packages/sdk-react-native'))
  archive = join(root, `usergist-feedback-react-native-${JSON.parse(readFileSync(join(repo, 'packages/sdk-react-native/package.json'))).version}.tgz`)
}
const archiveSha256 = createHash('sha256').update(readFileSync(archive)).digest('hex')
console.log(`SDK_ARCHIVE_SHA256=${archiveSha256}`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `archive=${archive}\narchive_sha256=${archiveSha256}\n`)
const expoVersion = major === '57' ? '57.0.20' : '56.0.21'
writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'usergist-expo-consumer', version: '1.0.0', private: true, main: 'index.js', dependencies: { expo: expoVersion, react: '19.2.3', 'react-native': major === '57' ? '0.86.3' : '0.85.3' } }, null, 2))
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
const bundled = JSON.parse(readFileSync(join(root, 'node_modules/expo/bundledNativeModules.json')))
const packages = ['@react-native-async-storage/async-storage', 'react-native-safe-area-context', 'expo-dev-client', ...(mode === 'expo-notifications' ? ['expo-notifications'] : [])]
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive, ...packages.map(p => `${p}@${bundled[p]}`)])
run('npm', ['install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', 'typescript@5.5.4', '@types/react@19.2.3'])
if (mode === 'expo-notifications') {
  writeFileSync(join(root, 'expo-types.ts'), "import * as Notifications from 'expo-notifications';\nimport { configureExpoNotifications } from '@usergist/feedback-react-native/expo';\nconst dispose: () => void = configureExpoNotifications(Notifications);\n")
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--skipLibCheck', '--moduleResolution', 'bundler', '--module', 'esnext', '--target', 'es2022', 'expo-types.ts'])
}
mkdirSync(join(root, 'assets'), { recursive: true })
// Build-only Firebase client fixture: cannot authenticate or deliver real pushes.
writeFileSync(join(root, 'google-services.json'), JSON.stringify({ project_info: { project_number: '123456789012', project_id: 'usergist-build-fixture', storage_bucket: 'usergist-build-fixture.appspot.com' }, client: [{ client_info: { mobilesdk_app_id: '1:123456789012:android:0123456789abcdef', android_client_info: { package_name: 'com.usergist.expofixture' } }, api_key: [{ current_key: 'AIzaSyBuildFixtureNotARealCredential0000000' }] }], configuration_version: '1' }))
writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { name: 'UserGist Expo Fixture', slug: 'usergist-expo-fixture', version: '1.0.0', platforms: ['ios', 'android'], ios: { bundleIdentifier: 'com.usergist.expofixture' }, android: { package: 'com.usergist.expofixture', googleServicesFile: './google-services.json' }, plugins: [...(mode === 'expo-notifications' ? ['expo-notifications'] : []), ['@usergist/feedback-react-native', { push: { mode, ios: major === '56' ? { apsEnvironment: 'production', extensionTargetName: 'UserGistReceipts', extensionBundleIdentifier: 'com.usergist.expofixture.receipts', appGroupIdentifier: 'group.com.usergist.expofixture.shared' } : { apsEnvironment: 'development' } } }]] } }, null, 2))
writeFileSync(join(root, 'index.js'), `import { registerRootComponent } from 'expo';\nimport React from 'react';\nimport { Text } from 'react-native';\nimport { UserGistProvider } from '@usergist/feedback-react-native';\n${mode === 'expo-notifications' ? "import * as Notifications from 'expo-notifications';\nimport { configureExpoNotifications } from '@usergist/feedback-react-native/expo';\nconfigureExpoNotifications(Notifications);\n" : ''}\nfunction App() { return React.createElement(UserGistProvider, null, React.createElement(Text, null, 'UserGist Expo fixture')); }\nregisterRootComponent(App);\n`)
writeFileSync(join(root, 'eas.json'), JSON.stringify({ build: { development: { developmentClient: true, distribution: 'internal' }, preview: { distribution: 'internal' }, production: {} } }, null, 2))
run(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--no-install', '--template', `expo-template-bare-minimum@${major === '57' ? '57.0.22' : '56.0.35'}`, ...(major === '57' ? ['--no-clean'] : [])])
run(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--no-install', '--template', `expo-template-bare-minimum@${major === '57' ? '57.0.22' : '56.0.35'}`, ...(major === '57' ? ['--no-clean'] : [])])
console.log(`EXPO_CONSUMER=${root}`)

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `consumer=${root}\n`)
