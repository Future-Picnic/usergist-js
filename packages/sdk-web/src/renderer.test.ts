// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountPreview } from './preview.js'
import { WebRenderer, safeUrl, validateAnswer } from './renderer.js'
let renderer: WebRenderer | undefined
afterEach(() => {
  renderer?.destroy()
  document.body.replaceChildren()
})
describe('browser presentation', () => {
  it('moves Back and Close into the header after advancing and keeps only the primary action below', async () => {
    const onClose = vi.fn()
    renderer = new WebRenderer()
    renderer.show({ pillar: 'survey', flow: {
      startQuestionId: 'q1', questions: [
        { id: 'q1', type: 'short_text', title: 'First answer', required: true },
        { id: 'q2', type: 'short_text', title: 'Second answer', required: true },
      ], branches: [], progressStyle: 'bar', backNavigation: true,
    }, onDismiss: onClose })
    const headerLabels = () => Array.from(renderer!.shadow.querySelectorAll('.ug-chrome button')).map(b => b.getAttribute('aria-label'))
    expect(headerLabels()).toEqual(['Close'])
    const input = renderer.shadow.querySelector<HTMLTextAreaElement>('textarea')!
    input.value = 'Keep this answer when going back'
    input.dispatchEvent(new Event('input'))
    renderer.shadow.querySelector<HTMLButtonElement>('.ug-footer button')!.click()
    await vi.waitFor(() => expect(renderer!.shadow.querySelector('h2')?.textContent).toBe('Second answer'))
    expect(headerLabels()).toEqual(['Back', 'Close'])
    expect(renderer.shadow.querySelectorAll('.ug-footer button')).toHaveLength(1)
    renderer.shadow.querySelector<HTMLButtonElement>('.ug-back')!.click()
    expect(headerLabels()).toEqual(['Close'])
    expect(renderer.shadow.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Keep this answer when going back')
    renderer.shadow.querySelector<HTMLButtonElement>('.ug-chrome [aria-label="Close"]')!.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('keeps required text submission disabled until a valid answer, then submits once', async () => {
    const submit = vi.fn(async () => {})
    renderer = new WebRenderer()
    renderer.show({ pillar: 'feedback', questions: [{ id: 'q', type: 'short_text', title: 'Your feedback', required: true }], onSubmit: submit })
    const action = renderer.shadow.querySelector<HTMLButtonElement>('.ug-footer .ug-button')!
    expect(action.disabled).toBe(true)
    const input = renderer.shadow.querySelector<HTMLTextAreaElement>('textarea')!
    input.value = 'Clear controls with enough room to type.'
    input.dispatchEvent(new Event('input'))
    expect(action.disabled).toBe(false)
    action.click()
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit).toHaveBeenCalledWith({ q: input.value })
  })
  it('retains app theme across surfaces and uses legible action labels on light brands', () => {
    renderer = new WebRenderer()
    renderer.setThemeOverrides({ colors: { background: '#111827', text: '#F3F4F6', primary: '#FACC15' }, radius: 16 })
    renderer.show({ pillar: 'feedback', questions: [{ id: 'q', type: 'short_text', title: 'Your feedback' }] })
    expect(renderer.host.style.getPropertyValue('--ug-bg')).toBe('#111827')
    expect(renderer.host.style.getPropertyValue('--ug-on-primary')).toBe('#000000')
    renderer.show({ pillar: 'inapp', title: 'An update', accentColor: '#D97706' })
    expect(renderer.host.style.getPropertyValue('--ug-bg')).toBe('#111827')
    expect(renderer.host.style.getPropertyValue('--ug-on-primary')).toBe('#000000')
    expect(renderer.shadow.querySelector('.ug-chrome button')?.getAttribute('aria-label')).toBe('Close')
  })
  it('isolates styles, treats content as text, and restores host focus/inert state', () => {
    const host = document.createElement('button')
    document.body.append(host)
    host.focus()
    renderer = new WebRenderer()
    renderer.show({
      pillar: 'feedback',
      questions: [
        { id: 'q', type: 'short_text', title: '<img src=x onerror=alert(1)>' },
      ],
    })
    expect(renderer.shadow.querySelector('h2')?.textContent).toContain('<img')
    expect(renderer.shadow.querySelector('h2 img')).toBeNull()
    expect(host.inert).toBe(true)
    renderer.close()
    expect(host.inert).toBe(false)
    expect(document.activeElement).toBe(host)
  })
  it('supports keyboard rating selection and submits the selected answer', async () => {
    const submit = vi.fn(async () => {})
    renderer = new WebRenderer()
    renderer.show({
      pillar: 'feedback',
      questions: [
        { id: 'rating', type: 'rating', title: 'How was it?', scale: 5 },
      ],
      onSubmit: submit,
    })
    const first =
      renderer.shadow.querySelector<HTMLButtonElement>('[role=radio]')!
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    renderer.shadow
      .querySelector<HTMLButtonElement>('.ug-footer .ug-button')!
      .click()
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith({ rating: 2 }))
    expect(renderer.shadow.textContent).toContain('Thank you')
  })
  it('follows survey branching instead of the physical question order', async () => {
    renderer = new WebRenderer()
    renderer.show({
      pillar: 'survey',
      flow: {
        startQuestionId: 'q1',
        questions: [
          {
            id: 'q1',
            type: 'single_choice',
            title: 'Choose',
            options: [{ id: 'skip', label: 'Skip' }],
          },
          { id: 'q2', type: 'short_text', title: 'Must be skipped' },
        ],
        branches: [
          {
            fromQuestionId: 'q1',
            condition: { op: 'eq', value: 'skip' },
            toQuestionId: '__end__',
          },
        ],
        progressStyle: 'bar',
        backNavigation: true,
      },
      onSubmit: async () => {},
    })
    const option = renderer.shadow.querySelector<HTMLInputElement>('input')!
    option.checked = true
    option.dispatchEvent(new Event('change'))
    renderer.shadow
      .querySelector<HTMLButtonElement>('.ug-footer .ug-button')!
      .click()
    await vi.waitFor(() =>
      expect(renderer!.shadow.textContent).toContain('Thank you')
    )
    expect(renderer.shadow.textContent).not.toContain('Must be skipped')
  })
  it('rejects active URLs and validates required and constrained answers', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,test')).toBeNull()
    expect(
      validateAnswer(
        {
          id: 'q',
          type: 'short_text',
          title: 'Email',
          validation: { kind: 'email' },
        },
        'no'
      )
    ).toBeTruthy()
    expect(
      validateAnswer(
        { id: 'q', type: 'multi_choice', title: 'Choose', minSelections: 2 },
        ['one']
      )
    ).toBeTruthy()
    expect(
      validateAnswer({ id: 'q', type: 'info_screen', title: 'Info' }, null)
    ).toBeNull()
  })
  it('previews the actual request board without activating a client or making requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const container = document.createElement('div')
    document.body.append(container)
    const preview = mountPreview(container, {
      pillar: 'requests',
      theme: { colors: { primary: '#6548E8' } },
    })
    const shadow = container.querySelector('[data-usergist]')!.shadowRoot!
    await vi.waitFor(() =>
      expect(shadow.textContent).toContain('Improved search')
    )
    shadow.querySelector<HTMLButtonElement>('.ug-list-item')!.click()
    await vi.waitFor(() => expect(shadow.textContent).toContain('Discussion'))
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    preview.destroy()
  })
})
