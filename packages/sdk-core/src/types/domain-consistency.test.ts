import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it, expect } from 'vitest'

it('keeps owned source, documentation, assets, and deployment URLs on the correct domain', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const obsolete = Buffer.from(['usergist', 'app'].join('.'))
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString().split('\0').filter(Boolean)
  const found = [...new Set(files)].filter((file) => readFileSync(resolve(root, file)).includes(obsolete))
  expect(found).toEqual([])
})
