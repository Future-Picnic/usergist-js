import { describe, expect, it } from 'vitest'
import { contentBodySchema, documentDraftSchema, moveRoadmapSchema } from './portal-content.js'
import { emptyDocumentDraft, safeContentHref, type ContentNode } from '../types/portal-content.js'
describe('portal document boundaries', () => {
  it('accepts the supported visual editor format and rejects executable or foreign node data', () => {
    expect(documentDraftSchema.safeParse(emptyDocumentDraft()).success).toBe(true)
    const text: ContentNode = {
      type: 'text',
      text: 'Safe link',
      marks: [{ type: 'link', attrs: { href: 'https://example.com/help' } }],
    }
    expect(
      contentBodySchema.safeParse({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 2 }, content: [text] }],
      }).success,
    ).toBe(true)
    for (const invalid of [
      { type: 'html', text: '<script>alert(1)</script>' },
      { type: 'image', attrs: { src: 'https://example.com/image.jpg' } },
      { type: 'paragraph', content: [{ type: 'heading', attrs: { level: 2 } }] },
      { type: 'paragraph', attrs: { assetId: 'd9b27b2c-9d50-4578-b7e4-1f040dd9cc60' } },
      { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    ])
      expect(contentBodySchema.safeParse({ type: 'doc', content: [invalid] }).success).toBe(false)
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.test',
      '/\\evil.test',
      'https://test\n.test',
    ])
      expect(safeContentHref(href)).toBe(false)
  })
  it('bounds nesting, total nodes, and body size before recursive processing', () => {
    let deep: ContentNode = { type: 'paragraph' }
    for (let i = 0; i < 25; i++) deep = { type: 'blockquote', content: [deep] }
    expect(contentBodySchema.safeParse({ type: 'doc', content: [deep] }).success).toBe(false)
    expect(
      contentBodySchema.safeParse({
        type: 'doc',
        content: Array.from({ length: 5001 }, () => ({ type: 'paragraph' })),
      }).success,
    ).toBe(false)
    expect(
      contentBodySchema.safeParse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(100001) }] }],
      }).success,
    ).toBe(false)
  })
  it('rejects invalid dates and duplicated roadmap confirmations while retaining timestamp precision', () => {
    expect(
      documentDraftSchema.safeParse({ ...emptyDocumentDraft(), releaseDate: '2026-02-30' }).success,
    ).toBe(false)
    const selected = { id: 'd9b27b2c-9d50-4578-b7e4-1f040dd9cc60', updatedAt: '2026-09-07T12:00:00.123456Z' }
    expect(
      moveRoadmapSchema.safeParse({ revision: 1, status: 'shipped', requests: [selected] }).success,
    ).toBe(true)
    expect(
      moveRoadmapSchema.safeParse({ revision: 1, status: 'shipped', requests: [selected, selected] }).success,
    ).toBe(false)
  })
})
