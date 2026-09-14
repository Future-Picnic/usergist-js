#!/usr/bin/env node
// Exercise the published archive in a consumer outside the monorepo.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sdk = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = mkdtempSync(join(tmpdir(), 'usergist-web-package-'))
const run = (command, args, cwd = fixture) => execFileSync(command, args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
})
try {
  let archive = process.argv[2] && resolve(process.argv[2])
  if (!archive) {
    run('pnpm', ['pack', '--pack-destination', fixture], sdk)
    archive = join(fixture, readdirSync(fixture).find(name => name.endsWith('.tgz')))
  }
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', archive])
  const installed = join(fixture, 'node_modules/@usergist/feedback-web')
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@usergist/feedback-web')
  assert.equal(manifest.license, 'MIT')
  assert.deepEqual(manifest.dependencies ?? {}, {}, 'Web must install without a runtime core dependency')
  assert.equal(existsSync(join(fixture, 'node_modules/@usergist/sdk-core')), false)
  assert.equal(existsSync(join(fixture, 'node_modules/react')), false, 'React must stay optional')
  const targets = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(targets)
  for (const target of targets(manifest.exports)) {
    assert.ok(existsSync(join(installed, target)), `Missing export: ${target}`)
  }
  for (const name of readdirSync(join(installed, 'dist'))) {
    if (!/\.(?:[cm]?js|d\.[cm]?ts)$/.test(name)) continue
    const content = readFileSync(join(installed, 'dist', name), 'utf8')
    assert.doesNotMatch(content, /(?:from\s*|import\s*|require\s*\()['"]@usergist\/sdk-core/, `Unbundled core import: ${name}`)
  }
  const smoke = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { readFileSync } from 'node:fs';
    import vm from 'node:vm';
    import * as esm from '@usergist/feedback-web';
    import { mountPreview } from '@usergist/feedback-web/preview';
    const require = createRequire(import.meta.url);
    globalThis.fetch = () => { throw new Error('Import/init must not make network requests') };
    for (const sdk of [esm, require('@usergist/feedback-web')]) {
      const client = sdk.createUserGist();
      await client.init({ writeKey: 'package-check-public-key' });
      assert.equal(client.getSnapshot().state, 'inactive');
      await client.destroy();
    }
    assert.equal(typeof mountPreview, 'function');
    assert.equal(typeof require('@usergist/feedback-web/preview').mountPreview, 'function');
    const context = vm.createContext({ window: {}, console });
    vm.runInContext(readFileSync(require.resolve('@usergist/feedback-web/browser'), 'utf8'), context);
    assert.equal(context.window.UserGist, context.UserGistWeb.UserGist);
    await context.window.UserGist.init({ writeKey: 'package-check-public-key' });
    assert.equal(context.window.UserGist.getSnapshot().state, 'inactive');
  `
  writeFileSync(join(fixture, 'smoke.mjs'), smoke)
  run(process.execPath, ['smoke.mjs'])

  // Install only consumer dependencies: no workspace links or sdk-core.
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
    'react@18.3.1', 'react-dom@18.3.1', '@types/react@18.3.3', '@types/react-dom@18.3.0', 'typescript@5.9.3'])
  const reactSmoke = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { createElement } from 'react';
    import { renderToString } from 'react-dom/server';
    import { UserGist } from '@usergist/feedback-web';
    import * as esm from '@usergist/feedback-web/react';
    const require = createRequire(import.meta.url);
    for (const [entry, expected] of [[esm, UserGist], [require('@usergist/feedback-web/react'), require('@usergist/feedback-web').UserGist]]) {
      function Consumer() {
        assert.equal(entry.useUserGist(), expected, 'React and root must share a singleton');
        return createElement('span', null, entry.useUserGistState().state);
      }
      assert.equal(renderToString(createElement(entry.UserGistProvider, null, createElement(Consumer))), '<span>inactive</span>');
    }
  `
  writeFileSync(join(fixture, 'react.mjs'), reactSmoke)
  run(process.execPath, ['react.mjs'])
  for (const name of ['react.js', 'react.cjs']) {
    assert.match(readFileSync(join(installed, 'dist', name), 'utf8'), /^['"]use client['"];?/)
  }
  const types = `
    import { createUserGist, type Consent, type WebSdkConfig } from '@usergist/feedback-web';
    import { UserGistProvider, useUserGistState } from '@usergist/feedback-web/react';
    import { mountPreview, type RenderExperience } from '@usergist/feedback-web/preview';
    const config: WebSdkConfig = { writeKey: 'public-key', allowAnonymous: true };
    const consent: Consent = { analytics: true, feedback: true, survey: true };
    const sdk = createUserGist();
    void sdk.init(config); void sdk.setConsent(consent); void sdk.startAnonymous();
    void sdk.identify('customer', {}, 'signed-token');
    void [UserGistProvider, useUserGistState, mountPreview];
    export type Preview = RenderExperience;
  `
  for (const extension of ['mts', 'cts']) writeFileSync(join(fixture, `consumer.${extension}`), types)
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--target', 'ES2022',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts', 'consumer.cts'])
  console.log(`Web archive passed: plain ESM/CommonJS, standalone script, React singleton/SSR, and strict consumer types.\nArchive: ${archive}\nConsumer fixture retained: ${fixture}`)
} catch (error) {
  console.error(error.stdout?.toString() || error.message)
  console.error(error.stderr?.toString() || '')
  console.error(`Consumer fixture retained for inspection: ${fixture}`)
  process.exitCode = 1
}
