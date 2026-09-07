import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(packageRoot, 'package.json'))
const scratch = mkdtempSync(join(tmpdir(), 'usergist-rn-package-'))
const sourceManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
console.log(`Package verification artifacts: ${scratch}`)

let archive = process.argv[2] && resolve(process.argv[2])
if (!archive) {
  execFileSync('pnpm', ['pack', '--pack-destination', scratch], {
    cwd: packageRoot,
    stdio: 'inherit',
  })
  archive = join(scratch, `usergist-feedback-react-native-${sourceManifest.version}.tgz`)
}
const appRoot = join(scratch, 'consumer')
const installedRoot = join(appRoot, 'node_modules', '@usergist', 'feedback-react-native')
mkdirSync(installedRoot, { recursive: true })
execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', installedRoot])

const manifest = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'))
assert.equal(manifest.name, '@usergist/feedback-react-native')
const coreManifest = JSON.parse(readFileSync(join(packageRoot, '../sdk-core/package.json'), 'utf8'))
assert.equal(manifest.dependencies['@usergist/sdk-core'], `^${coreManifest.version}`)
for (const file of [
  'dist/index.js',
  'dist/NativeUserGistPush.js',
  'react-native.config.js',
  'UserGistFeedback.podspec',
  'UserGistFeedbackExtension.podspec',
  'ios/UserGistPush.h',
  'ios/UserGistPush.mm',
  'ios/UserGistPushImpl.swift',
  'ios/Extension/UserGistNotificationService.swift',
  'android/build.gradle',
  'android/src/main/AndroidManifest.xml',
  'android/src/main/java/studio/usergist/feedback/UserGistPushModule.kt',
  'android/src/main/java/studio/usergist/feedback/UserGistPushPackage.kt',
]) {
  assert.ok(existsSync(join(installedRoot, file)), `Published package is missing ${file}`)
}

writeFileSync(join(appRoot, 'package.json'), JSON.stringify({
  name: 'usergist-package-consumer',
  private: true,
  dependencies: { [manifest.name]: manifest.version },
}))
// Supply the installed dependency root as RN CLI autolinking does. This prevents
// pnpm's codegen resolver from accidentally inspecting the workspace source.
writeFileSync(join(appRoot, 'react-native.config.js'), `module.exports = ${JSON.stringify({
  dependencies: { [manifest.name]: { root: installedRoot } },
})}\n`)
const reactNativeRoot = dirname(require.resolve('react-native/package.json'))
for (const platform of ['ios', 'android']) {
  execFileSync(process.execPath, [
    join(reactNativeRoot, 'scripts/generate-codegen-artifacts.js'),
    '-p', appRoot,
    '-t', platform,
    '-o', join(scratch, platform),
  ], { cwd: appRoot, stdio: 'inherit' })
}
console.log('Published native bridge files and iOS/Android codegen discovery passed.')
