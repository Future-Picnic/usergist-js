const { test } = require('node:test')
const assert = require('node:assert/strict')
const { settings, withUserGist } = require('./index.cjs')
const base = () => ({ name: 'Consumer', slug: 'consumer', ios: { bundleIdentifier: 'com.test.consumer' }, android: { package: 'com.test.consumer', googleServicesFile: './google-services.json' } })
const options = { push: { mode: 'automatic', ios: { apsEnvironment: 'production' } } }
test('base setup does not provision push or signing resources', () => {
  const config = withUserGist(base())
  assert.equal(config.extra, undefined)
  assert.equal(settings(base()), null)
})
test('extension EAS metadata is available before native generation and repeatable', () => {
  const once = withUserGist(base(), options)
  const twice = withUserGist(once, options)
  const extensions = twice.extra.eas.build.experimental.ios.appExtensions
  assert.equal(extensions.length, 1)
  assert.equal(extensions[0].bundleIdentifier, 'com.test.consumer.UserGistNotificationServiceExtension')
  assert.deepEqual(extensions[0].entitlements['com.apple.security.application-groups'], ['group.com.test.consumer.usergist'])
})
test('signing environment is explicit and custom identifiers are validated', () => {
  assert.throws(() => settings(base(), { push: { mode: 'automatic' } }), /apsEnvironment/)
  assert.throws(() => settings(base(), { push: { ...options.push, ios: { ...options.push.ios, extensionTargetName: '../Other' } } }), /identifier/)
  const configured = settings(base(), { push: { ...options.push, ios: { ...options.push.ios, appGroupIdentifier: 'group.com.test.shared', extensionBundleIdentifier: 'com.test.consumer.receipts', extensionTargetName: 'Receipts' } } })
  assert.equal(configured.ios.extensionTargetName, 'Receipts')
})
test('existing notification ownership cannot be silently replaced', () => {
  assert.throws(() => withUserGist({ ...base(), plugins: ['expo-notifications'] }, options), /preserve its handlers/)
  assert.throws(() => withUserGist(base(), { push: { ...options.push, mode: 'expo-notifications' } }), /add its plugin/)
  assert.throws(() => withUserGist({ ...base(), android: { package: 'com.test.consumer' } }, options), /googleServicesFile/)
})
