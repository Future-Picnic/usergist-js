#!/usr/bin/env node
// Runs ONLY from the public repository's trusted main branch (or a maintainer's CLI).
// Never checks out or executes private PR code. Build jobs receive no App credentials.
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SOURCE = 'Future-Picnic/usergist'
export const FAMILIES = {
  js: { repo: 'Future-Picnic/usergist-js', context: 'SDK / JavaScript & Expo', roots: ['packages/sdk-core/', 'packages/sdk-react-native/', 'packages/sdk-web/', 'tools/expo/'], files: ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json'] },
  ios: { repo: 'Future-Picnic/usergist-ios', context: 'SDK / iOS', roots: ['packages/sdk-ios/'], files: ['tools/test-ios-package.sh'] },
  android: { repo: 'Future-Picnic/usergist-android', context: 'SDK / Android', roots: ['packages/sdk-android/'], files: [] },
  flutter: { repo: 'Future-Picnic/usergist-flutter', context: 'SDK / Flutter', roots: ['packages/sdk-flutter/'], files: [] },
}
export function selected(path, family) {
  const config = FAMILIES[family]
  return config.files.includes(path) || config.roots.some(root => path.startsWith(root))
}
export function affected(paths, family) {
  return paths.some(path => selected(path, family) || path.startsWith(`sdk-mirrors/${family}/`) || path.startsWith('sdk-mirrors/js/tools/sdk-ci/') || path.startsWith('tools/sdk-ci/') || path === '.github/workflows/sdk-ci.yml' || (family === 'js' && (path === '.github/workflows/sdk-expo.yml' || path.startsWith('apps/demo-expo/'))))
}
export function validateEntry(entry) {
  if (/[\t\r\n\\]/.test(entry.path)) throw new Error('SDK snapshot contains an unsupported path')
  if (!['100644', '100755'].includes(entry.mode)) throw new Error('SDK snapshot contains a symlink or unsupported file mode')
  if (entry.path.split('/').some(p => ['.github', '.git', 'node_modules', '.env'].includes(p)) || /(^|\/)\.env[.]|\.(pem|p8|p12|pfx|keystore|jks)$/i.test(entry.path)) throw new Error('SDK snapshot contains a forbidden path')
}
export function sanitizeManifest(text) {
  const p = JSON.parse(text)
  return JSON.stringify({ name: 'usergist-sdk-validation', private: true, packageManager: p.packageManager, engines: p.engines, devDependencies: p.devDependencies }, null, 2) + '\n'
}
export function resultState(run) {
  if (run.status !== 'completed') return 'pending'
  return run.conclusion === 'success' ? 'success' : 'failure'
}
export function matchingRun(runs, snapshot, workflowHead) {
  // A result from an older workflow or a similarly named job is never accepted.
  return runs.filter(r => r.event === 'workflow_dispatch' && r.head_sha === workflowHead && r.display_title === `SDK snapshot ${snapshot}`).sort((a, b) => b.id - a.id)[0]
}

function command(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options })
}
function api(path, data, method) {
  const args = ['api', path, '--method', method || (data ? 'POST' : 'GET')]
  if (data) args.push('--input', '-')
  const result = command('gh', args, data ? { input: JSON.stringify(data) } : {})
  return result ? JSON.parse(result) : null
}
function pages(path, field) {
  const result = command('gh', ['api', '--paginate', '--slurp', path])
  return JSON.parse(result).flatMap(page => field ? page[field] : page)
}
function gitEnv(token, extra = {}) {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`, ...extra }
}
export function snapshot(source, sha, family, env) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid source commit')
  const config = FAMILIES[family]
  const git = (args, opts = {}) => command('git', ['--git-dir', source, ...args], { env, ...opts })
  const records = git(['ls-tree', '-rz', '--full-tree', sha]).split('\0').filter(Boolean)
  const entries = records.map(record => { const [meta, path] = record.split('\t'); const [mode, type, hash] = meta.split(' '); return { mode, type, hash, path } }).filter(e => selected(e.path, family))
  if (!entries.some(e => config.roots.some(root => e.path.startsWith(root)))) throw new Error('SDK source is missing')
  const generated = (path, content) => ({ mode: '100644', path, hash: git(['hash-object', '-w', '--stdin'], { input: content }).trim() })
  const accepted = entries.map(e => {
    validateEntry(e)
    if (family === 'js' && e.path === 'package.json') return generated(e.path, sanitizeManifest(git(['show', `${sha}:${e.path}`])))
    if (family === 'js' && e.path === 'pnpm-workspace.yaml') return generated(e.path, "packages:\n  - 'packages/*'\n")
    return e
  })
  accepted.push(generated('.gitignore', 'node_modules/\ndist/\n.ci/\n.gradle/\nbuild/\n.dart_tool/\n'))
  // A fresh index, tree and parentless commit prevent private history, apps and
  // workflow files from becoming reachable from the public snapshot ref.
  const index = join(mkdtempSync(join(tmpdir(), 'usergist-sdk-index-')), 'index')
  const indexEnv = { ...env, GIT_INDEX_FILE: index }
  git(['update-index', '-z', '--index-info'], { env: indexEnv, input: accepted.map(e => `${e.mode} ${e.hash}\t${e.path}\0`).join('') })
  const tree = git(['write-tree'], { env: indexEnv }).trim()
  const commitEnv = { ...env, GIT_AUTHOR_NAME: 'usergist-sdk-ci', GIT_AUTHOR_EMAIL: 'sdk-ci@users.noreply.github.com', GIT_COMMITTER_NAME: 'usergist-sdk-ci', GIT_COMMITTER_EMAIL: 'sdk-ci@users.noreply.github.com', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' }
  return git(['commit-tree', tree], { env: commitEnv, input: 'SDK validation snapshot\n' }).trim()
}
function status(sha, context, state, description, url) {
  const existing = pages(`repos/${SOURCE}/commits/${sha}/statuses?per_page=100`).find(s => s.context === context)
  if (existing?.state === state && existing.description === description && existing.target_url === url) return
  api(`repos/${SOURCE}/statuses/${sha}`, { context, state, description, target_url: url })
}
export async function main() {
  const args = process.argv.slice(2)
  const prIndex = args.indexOf('--pr')
  const prNumber = prIndex < 0 ? undefined : args[prIndex + 1]
  if (prNumber && !/^\d+$/.test(prNumber)) throw new Error('Invalid PR number')
  const dryRun = args.includes('--dry-run')
  const token = process.env.GH_TOKEN || command('gh', ['auth', 'token']).trim()
  const env = gitEnv(token)
  const prs = prNumber ? [api(`repos/${SOURCE}/pulls/${prNumber}`)] : pages(`repos/${SOURCE}/pulls?state=open&per_page=100`)
  let failures = 0
  for (const pr of prs) {
    if (pr.state !== 'open' || pr.draft) continue
    // Never automatically disclose code submitted from another repository.
    if (pr.head.repo?.full_name !== SOURCE) continue
    const sha = pr.head.sha
    const files = pages(`repos/${SOURCE}/pulls/${pr.number}/files?per_page=100`)
    if (files.length >= 3000) throw new Error('PR exceeds GitHub file-list limit; manual classification required')
    const paths = files.flatMap(f => [f.filename, f.previous_filename].filter(Boolean))
    let source
    for (const [family, config] of Object.entries(FAMILIES)) {
      try {
        if (!affected(paths, family)) {
          if (!dryRun) status(sha, config.context, 'success', 'No changes affecting this SDK family', pr.html_url)
          continue
        }
        if (!source) {
          source = mkdtempSync(join(tmpdir(), 'usergist-sdk-source-'))
          command('git', ['init', '--bare', source])
          command('git', ['--git-dir', source, 'fetch', '--depth=1', '--no-tags', `https://github.com/${SOURCE}.git`, sha], { env })
        }
        const commit = snapshot(source, sha, family, env)
        console.log(`PR ${pr.number} ${sha}: ${family} snapshot ${commit}${dryRun ? ' (dry run)' : ''}`)
        if (dryRun) continue
        const workflowHead = api(`repos/${config.repo}/git/ref/heads/main`).object.sha
        const runs = pages(`repos/${config.repo}/actions/workflows/sdk-pr.yml/runs?event=workflow_dispatch&per_page=100`, 'workflow_runs')
        const run = matchingRun(runs, commit, workflowHead)
        if (run) {
          const state = resultState(run)
          status(sha, config.context, state, state === 'success' ? 'Public SDK validation passed' : state === 'pending' ? 'Public SDK validation running' : `Public SDK validation: ${run.conclusion}`, run.html_url)
          continue
        }
        // Dispatch only workflows on trusted public main, never on the source ref.
        command('git', ['--git-dir', source, 'push', `https://github.com/${config.repo}.git`, `${commit}:refs/heads/ci/snapshot-${commit}`], { env })
        status(sha, config.context, 'pending', 'Public SDK validation queued', `https://github.com/${config.repo}/actions/workflows/sdk-pr.yml`)
        api(`repos/${config.repo}/actions/workflows/sdk-pr.yml/dispatches`, { ref: 'main', inputs: { snapshot: commit } })
      } catch {
        // Do not print subprocess stderr: authentication errors can contain
        // headers and private git metadata. The private status is actionable.
        failures++
        console.error(`PR ${pr.number}: ${family} bridge failed; check GitHub App permissions and public workflow installation`)
        if (!dryRun) {
          try { status(sha, config.context, 'error', 'SDK bridge failed; inspect public coordinator permissions/setup', 'https://github.com/Future-Picnic/usergist-js/actions/workflows/sdk-pr-bridge.yml') } catch { /* permissions may themselves be the blocker */ }
        }
      }
    }
  }
  if (failures) throw new Error(`${failures} SDK bridge operation(s) failed`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
