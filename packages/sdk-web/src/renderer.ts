import {
  nextQuestionId,
  resolveWebPresentation,
  type PromptTheme,
  type SurveyFlow,
  type SurveyAnswerRecord,
  type SurveyEndScreen,
  type WebPresentation,
} from '@usergist/sdk-core/client'
import { webStyles } from './styles.js'
import { surfaceStyles } from './surface-styles.js'
import { onPrimary } from './surface-theme.js'

export type Answer = string | number | string[] | null
export interface RenderQuestion {
  id: string
  type: string
  title: string
  subtitle?: string
  required?: boolean
  imageUrl?: string
  options?: ReadonlyArray<{ id: string; label: string }>
  items?: ReadonlyArray<{ id: string; label: string }>
  scale?: number
  display?: string
  style?: string
  multiSelect?: boolean
  placeholder?: string
  maxLength?: number
  lowLabel?: string
  highLabel?: string
  labels?: ReadonlyArray<string>
  minSelections?: number
  maxSelections?: number
  minDate?: string
  maxDate?: string
  body?: string
  followUp?: string
  allowOther?: boolean
  validation?: {
    kind?: string
    pattern?: string
    minLength?: number
    maxLength?: number
  }
}
export interface RenderExperience {
  pillar: 'feedback' | 'survey' | 'inapp' | 'requests'
  requestBranding?: {
    entryLabel?: string
    introCopy?: string | null
    logoUrl?: string | null
  }
  title?: string
  body?: string | null
  imageUrl?: string | null
  format?: string
  questions?: ReadonlyArray<RenderQuestion>
  flow?: SurveyFlow
  endScreen?: SurveyEndScreen | null
  theme?: PromptTheme | null
  webPresentation?: WebPresentation | null
  backdropEnabled?: boolean
  backgroundColor?: string | null
  accentColor?: string | null
  currentQuestionId?: string | null
  answers?: SurveyAnswerRecord
  showEndScreen?: boolean
  autoDismissSeconds?: number | null
  ctas?: ReadonlyArray<{
    label: string
    action: string
    target?: string
    actionJson?: Readonly<Record<string, unknown>>
  }>
  onProgress?: (
    answers: SurveyAnswerRecord,
    currentQuestionId: string | null
  ) => Promise<void>
  onDraft?: (answers: SurveyAnswerRecord, currentQuestionId: string) => void
  onSubmit?: (answers: SurveyAnswerRecord) => Promise<void>
  onDismiss?: (answers: SurveyAnswerRecord) => void
  onCta?: (cta: NonNullable<RenderExperience['ctas']>[number]) => void
}
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text != null) node.textContent = text
  return node
}
function icon(kind: 'close' | 'back' | 'check' | 'star') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', kind === 'check' ? '40' : '20')
  svg.setAttribute('height', kind === 'check' ? '40' : '20')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(svg.namespaceURI, 'path')
  path.setAttribute(
    'd',
    kind === 'close'
      ? 'M6 6l12 12M6 18L18 6'
      : kind === 'back'
      ? 'M14 6l-6 6 6 6'
      : kind === 'check'
      ? 'M5 12l4 4L19 6'
      : 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z'
  )
  svg.append(path)
  return svg
}
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value, document.baseURI)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
export function validateAnswer(
  q: RenderQuestion,
  value: Answer | undefined
): string | null {
  const missing =
    value == null || value === '' || (Array.isArray(value) && !value.length)
  if (q.type === 'info_screen') return null
  if (missing)
    return q.required === false
      ? null
      : 'Please answer this question to continue.'
  if (typeof value === 'string') {
    const max = q.maxLength ?? q.validation?.maxLength
    if (max && value.length > max) return `Use ${max} characters or fewer.`
    if (q.validation?.minLength && value.length < q.validation.minLength)
      return `Use at least ${q.validation.minLength} characters.`
    if (
      q.validation?.kind === 'email' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      return 'Enter a valid email address.'
    if (q.validation?.kind === 'url' && !/^https?:\/\/\S+$/i.test(value))
      return 'Enter a complete website URL.'
    if (q.validation?.kind === 'number' && !Number.isFinite(Number(value)))
      return 'Enter a valid number.'
    if (q.validation?.kind === 'regex' && q.validation.pattern) {
      try {
        if (!new RegExp(q.validation.pattern, 'u').test(value))
          return 'Check the format of your answer.'
      } catch {
        return 'This question has an invalid validation rule.'
      }
    }
    if (
      q.type === 'single_date' &&
      ((q.minDate && value < q.minDate) || (q.maxDate && value > q.maxDate))
    )
      return 'Choose a date within the allowed range.'
  }
  if (Array.isArray(value)) {
    if (q.minSelections && value.length < q.minSelections)
      return `Choose at least ${q.minSelections} options.`
    if (q.maxSelections && value.length > q.maxSelections)
      return `Choose at most ${q.maxSelections} options.`
  }
  return null
}

export class WebRenderer {
  readonly host: HTMLElement
  readonly shadow: ShadowRoot
  private root?: HTMLElement
  private purpose?: 'feedback' | 'survey'
  private previousFocus?: HTMLElement | null
  private inert: Array<[HTMLElement, boolean]> = []
  private closeHandler?: () => void
  private dismissTimer?: ReturnType<typeof setTimeout>
  private themeOverrides?: PromptTheme
  constructor(
    private options: {
      container?: HTMLElement
      preview?: boolean
      nonce?: string
      zIndex?: number
    } = {}
  ) {
    this.host = el('div')
    this.host.dataset.usergist = 'web'
    // A real layout width makes container queries identical in preview/runtime.
    Object.assign(this.host.style, {
      width: '100%',
      height: '100%',
      position: options.preview ? 'absolute' : 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: String(options.zIndex ?? 2147483000),
    })
    this.host.style.setProperty('--ug-z', String(options.zIndex ?? 2147483000))
    this.shadow = this.host.attachShadow({ mode: 'open' })
    const style = el('style')
    if (options.nonce) style.nonce = options.nonce
    style.textContent = webStyles + surfaceStyles
    this.shadow.append(style)
    ;(options.container ?? document.body).append(this.host)
  }
  get isOpen() {
    return Boolean(this.root)
  }
  get consentPurpose() {
    return this.root ? this.purpose : undefined
  }
  setThemeOverrides(theme: PromptTheme) {
    this.themeOverrides = theme
    this.setTheme()
  }
  setTheme(campaign?: PromptTheme | null) {
    const theme: PromptTheme = {
      ...this.themeOverrides,
      ...campaign,
      colors: {
        ...this.themeOverrides?.colors,
        ...Object.fromEntries(Object.entries(campaign?.colors ?? {}).filter(([, value]) => value != null)),
      },
    }
    const vars: Record<string, string> = {
      '--ug-primary': theme?.colors?.primary ?? '#6154E8',
      '--ug-bg': theme?.colors?.background ?? '#FFFFFF',
      '--ug-text': theme?.colors?.text ?? '#15151D',
      '--ug-muted': theme?.colors?.subtext ?? '#73738A',
      '--ug-border': theme?.colors?.border ?? '#E3E4EE',
      '--ug-radius': `${Math.max(0, Math.min(theme?.radius ?? 20, 40))}px`,
      '--ug-font': `${theme?.fontFamily ?? 'Inter'},system-ui,sans-serif`,
      '--ug-on-primary': onPrimary(theme?.colors?.primary ?? '#6154E8', theme?.colors?.background ?? '#FFFFFF'),
    }
    for (const [key, value] of Object.entries(vars))
      this.host.style.setProperty(key, value)
  }
  frame(
    pillar: RenderExperience['pillar'],
    title: string,
    presentation?: WebPresentation | null,
    dismiss?: () => void
  ) {
    this.close(false)
    this.closeHandler = dismiss
    const p = resolveWebPresentation(pillar, presentation)
    const root = el(
      'div',
      `ug-root ${pillar} ${p.layout} ${p.position} ${
        p.backdrop ? 'backdrop' : ''
      } ${this.options.preview ? 'preview' : ''}`
    )
    this.root = root
    this.purpose = pillar === 'survey' ? 'survey' : 'feedback'
    const widths = {
      compact: 420,
      standard: pillar === 'survey' ? 640 : pillar === 'feedback' ? 420 : 560,
      wide: pillar === 'requests' ? 960 : 800,
    }
    root.style.setProperty(
      '--ug-width',
      `${p.layout === 'card' ? 360 : widths[p.size]}px`
    )
    const surface = el('section', 'ug-surface')
    surface.setAttribute('role', p.layout === 'card' ? 'region' : 'dialog')
    surface.setAttribute('aria-label', title)
    if (p.layout !== 'card') surface.setAttribute('aria-modal', 'true')
    const close = el('button', 'ug-close')
    close.type = 'button'
    close.setAttribute('aria-label', 'Close')
    close.append(icon('close'))
    close.onclick = () => this.close()
    const chrome = el('header', 'ug-chrome')
    chrome.append(close)
    surface.append(chrome)
    root.append(surface)
    this.shadow.append(root)
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        this.close()
        return
      }
      if (event.key === 'Tab' && p.layout !== 'card') {
        const controls = Array.from(
          surface.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]'
          )
        ).filter((n) => !n.hidden)
        const active = this.shadow.activeElement
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && active === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    })
    if (!this.options.preview && p.layout !== 'card') {
      this.previousFocus = document.activeElement as HTMLElement
      for (const sibling of Array.from(
        (this.options.container ?? document.body).children
      ))
        if (sibling !== this.host && sibling instanceof HTMLElement) {
          this.inert.push([sibling, sibling.inert])
          sibling.inert = true
        }
      close.focus()
    }
    return surface
  }
  show(experience: RenderExperience) {
    this.setTheme(
      experience.theme ?? {
        colors: {
          background: experience.backgroundColor ?? undefined,
          primary: experience.accentColor ?? undefined,
        },
      }
    )
    const presentation = {
      ...(experience.format === 'slideup'
        ? { layout: 'card' as const, backdrop: false }
        : { backdrop: experience.backdropEnabled ?? true }),
      ...experience.webPresentation,
    }
    const answers: Record<string, Answer> = { ...experience.answers } as Record<
      string,
      Answer
    >
    const surface = this.frame(
      experience.pillar,
      experience.title ??
        (experience.pillar === 'survey' ? 'Survey' : 'Feedback'),
      presentation,
      () => experience.onDismiss?.(structuredClone(answers) as SurveyAnswerRecord)
    )
    if (experience.pillar === 'inapp') {
      const content = el('div', 'ug-content')
      this.header(
        content,
        experience.title ?? '',
        experience.body ?? '',
        experience.imageUrl
      )
      const footer = el('div', 'ug-footer')
      for (const [index, cta] of (experience.ctas ?? []).entries()) {
        const button = el(
          'button',
          `ug-button ${index ? 'secondary' : ''}`,
          cta.label
        )
        button.onclick = () => experience.onCta?.(cta)
        footer.append(button)
      }
      surface.append(content)
      if (footer.children.length) surface.append(footer)
      if (
        experience.autoDismissSeconds &&
        experience.autoDismissSeconds > 0 &&
        !this.options.preview
      )
        this.dismissTimer = setTimeout(
          () => this.close(),
          experience.autoDismissSeconds * 1000
        )
      return
    }
    const questions =
      experience.questions ??
      (experience.flow?.questions as
        | ReadonlyArray<RenderQuestion>
        | undefined) ??
      []
    let current = experience.showEndScreen
      ? '__end__'
      : experience.currentQuestionId ??
        experience.flow?.startQuestionId ??
        questions[0]?.id
    const history: string[] = []
    const dots = experience.flow?.progressStyle === 'dots'
    const progress = el('div', dots ? 'ug-progress ug-dots' : 'ug-progress')
    const fill = el('span')
    if (dots) questions.forEach(() => progress.append(el('span')))
    else progress.append(fill)
    const showProgress = (experience.pillar === 'survey' && experience.flow?.progressStyle !== 'none') || questions.length > 1
    const chrome = surface.querySelector<HTMLElement>('.ug-chrome')!
    const close = chrome.querySelector<HTMLButtonElement>('[aria-label="Close"]')!
    if (showProgress) chrome.append(progress)
    const content = el('div', 'ug-content')
    const footer = el('div', 'ug-footer')
    surface.append(content, footer)
    const draw = () => {
      content.replaceChildren()
      footer.replaceChildren()
      const q = questions.find((q) => q.id === current)
      chrome.replaceChildren(close)
      chrome.removeAttribute('data-has-back')
      if (q && showProgress) chrome.append(progress)
      if (!q) {
        this.success(content, experience.endScreen)
        const cta = experience.endScreen?.cta
        if (cta && cta.kind !== 'close')
          footer.append(
            this.button(cta.label, () => {
              experience.onCta?.({
                label: cta.label,
                action: cta.kind === 'url' ? 'open_url' : 'deep_link',
                target: cta.target,
              })
              this.close(false)
            })
          )
        footer.append(
          this.button(cta?.kind === 'close' ? cta.label : 'Done', () =>
            this.close(false)
          )
        )
        return
      }
      const index = questions.indexOf(q)
      progress.setAttribute('role', 'progressbar')
      progress.setAttribute('aria-label', 'Survey progress')
      progress.setAttribute('aria-valuemin', '1')
      progress.setAttribute('aria-valuemax', String(questions.length))
      progress.setAttribute('aria-valuenow', String(index + 1))
      if (dots) Array.from(progress.children).forEach((dot, i) => {
        ;(dot as HTMLElement).dataset.active = String(i <= index)
      })
      fill.style.width = `${Math.round(
        ((index + 1) / Math.max(questions.length, 1)) * 100
      )}%`
      if (questions.length > 1) content.append(
        el('div', 'ug-step', `${index + 1} of ${questions.length}`)
      )
      content.classList.toggle('ug-numeric', q.type === 'nps' || q.type === 'rating')
      this.header(content, q.title, q.subtitle ?? q.body, q.imageUrl)
      let saving = false
      let updateAction: () => void = () => undefined
      this.question(content, q, answers[q.id], (value) => {
        answers[q.id] = value
        experience.onDraft?.(structuredClone(answers) as SurveyAnswerRecord, q.id)
        updateAction()
      })
      if (q.type === 'nps' && q.followUp) {
        const label = el('label', '', q.followUp)
        const follow = el('textarea', 'ug-input')
        follow.setAttribute('aria-label', q.followUp)
        follow.value = String(answers[`${q.id}__followUp`] ?? '')
        follow.oninput = () => {
          answers[`${q.id}__followUp`] = follow.value
          experience.onDraft?.(structuredClone(answers) as SurveyAnswerRecord, q.id)
        }
        label.append(follow)
        content.append(label)
      }
      const error = el('div', 'ug-error')
      error.setAttribute('role', 'alert')
      content.append(error)
      if (history.length && experience.flow?.backNavigation !== false) {
        const back = el('button', 'ug-back')
        back.type = 'button'
        back.setAttribute('aria-label', 'Back')
        back.append(icon('back'))
        back.onclick = () => { current = history.pop(); draw() }
        chrome.prepend(back)
        chrome.append(close)
        chrome.dataset.hasBack = 'true'
      }
      const next = experience.flow
        ? nextQuestionId(experience.flow, q.id, answers as SurveyAnswerRecord)
        : questions[index + 1]?.id ?? null
      const submit = this.button(next ? 'Continue' : 'Submit', async () => {
        const issue = validateAnswer(q, answers[q.id])
        if (issue) {
          error.textContent = issue
          return
        }
        submit.disabled = true
        saving = true
        submit.textContent = 'Saving…'
        try {
          const destination = experience.flow
            ? nextQuestionId(
                experience.flow,
                q.id,
                answers as SurveyAnswerRecord
              )
            : questions[index + 1]?.id ?? null
          await experience.onProgress?.(
            answers as SurveyAnswerRecord,
            destination
          )
          if (!surface.isConnected) return
          if (destination) {
            history.push(q.id)
            current = destination
            draw()
          } else {
            await experience.onSubmit?.(answers as SurveyAnswerRecord)
            if (!surface.isConnected) return
            this.closeHandler = undefined
            current = undefined
            draw()
          }
        } catch (e) {
          error.textContent =
            e instanceof Error ? e.message : 'Unable to save. Please try again.'
          saving = false
          updateAction()
          submit.textContent = next ? 'Continue' : 'Submit'
        }
      })
      updateAction = () => { submit.disabled = saving || Boolean(validateAnswer(q, answers[q.id])) }
      updateAction()
      footer.append(submit)
    }
    draw()
  }
  button(label: string, action: () => void, secondary = false) {
    const button = el(
      'button',
      `ug-button ${secondary ? 'secondary' : ''}`,
      label
    )
    button.type = 'button'
    button.onclick = action
    return button
  }
  header(
    parent: HTMLElement,
    title: string,
    body?: string | null,
    image?: string | null
  ) {
    if (image) {
      const src = safeUrl(image)
      if (src) {
        const img = el('img')
        img.src = src
        img.alt = ''
        img.onerror = () => {
          img.hidden = true
        }
        parent.append(img)
      }
    }
    parent.append(el('h2', '', title))
    if (body) parent.append(el('p', '', body))
  }
  private success(content: HTMLElement, end?: SurveyEndScreen | null) {
    content.classList.add('ug-success')
    content.append(icon('check'))
    const e = end as { headline?: string; body?: string } | undefined
    this.header(
      content,
      e?.headline ?? 'Thank you',
      e?.body ?? 'Your response has been saved.'
    )
  }
  private question(
    parent: HTMLElement,
    q: RenderQuestion,
    initial: Answer | undefined,
    onChange: (answer: Answer) => void
  ) {
    if (['rating', 'nps', 'likert'].includes(q.type)) {
      const start = q.type === 'nps' ? 0 : 1
      const max = q.type === 'nps' ? 10 : q.type === 'likert' ? 5 : q.scale ?? 5
      const group = el(
        'div',
        `ug-scale ${q.type === 'nps' ? 'nps' : ''} ${max === 10 ? 'ten' : ''}`
      )
      group.setAttribute('role', 'radiogroup')
      group.setAttribute('aria-label', q.title)
      group.style.setProperty('--ug-count', String(max - start + 1))
      for (let value = start; value <= max; value++) {
        const label =
          q.type === 'likert'
            ? q.labels?.[value - 1] ??
              [
                'Strongly disagree',
                'Disagree',
                'Neutral',
                'Agree',
                'Strongly agree',
              ][value - 1]
            : String(value)
        const button = el('button', 'ug-score', label)
        button.type = 'button'
        button.setAttribute('role', 'radio')
        button.setAttribute('aria-label', `${value}: ${label}`)
        button.setAttribute('aria-checked', String(initial === value))
        if (q.type === 'rating' && q.display === 'emoji') {
          button.textContent = ['😞', '🙁', '😐', '🙂', '😃'][
            Math.round(((value - 1) / (max - 1)) * 4)
          ]!
          button.setAttribute('aria-label', `${value} of ${max}`)
        }
        if (
          q.type === 'rating' &&
          (q.display === 'stars' || q.style === 'star')
        ) {
          button.replaceChildren(icon('star'))
          button.setAttribute('aria-label', `${value} of ${max} stars`)
        }
        button.onclick = () => {
          onChange(value)
          for (const sibling of Array.from(group.children))
            sibling.setAttribute('aria-checked', String(sibling === button))
        }
        button.onkeydown = (e) => {
          if (
            ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)
          ) {
            e.preventDefault()
            const buttons = Array.from(group.children) as HTMLButtonElement[]
            const i = buttons.indexOf(button)
            const step = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1
            const target = buttons[(i + step + buttons.length) % buttons.length]
            target?.focus()
            target?.click()
          }
        }
        group.append(button)
      }
      parent.append(group)
      const labels = el('div', 'ug-labels')
      labels.append(
        el('span', '', q.lowLabel ?? ''),
        el('span', '', q.highLabel ?? '')
      )
      parent.append(labels)
      return
    }
    if (['single_choice', 'multi_choice', 'multiple_choice'].includes(q.type)) {
      const multi = q.type === 'multi_choice' || q.multiSelect
      let values = Array.isArray(initial)
        ? [...initial]
        : initial
        ? [String(initial)]
        : []
      const group = el('div', 'ug-options')
      const name = `ug-${q.id}`
      for (const option of q.options ?? []) {
        const label = el('label', 'ug-option')
        const input = el('input')
        input.type = multi ? 'checkbox' : 'radio'
        input.name = name
        input.value = option.id
        input.checked = values.includes(option.id)
        label.append(input, el('span', '', option.label))
        input.onchange = () => {
          values = multi
            ? input.checked
              ? [...values, option.id]
              : values.filter((v) => v !== option.id)
            : [option.id]
          onChange(multi ? values : option.id)
        }
        group.append(label)
      }
      if (q.allowOther) {
        const label = el('label', 'ug-option')
        const input = el('input')
        input.type = multi ? 'checkbox' : 'radio'
        input.name = name
        const field = el('input', 'ug-input')
        field.placeholder = 'Your answer'
        field.setAttribute('aria-label', 'Other answer')
        const known = new Set((q.options ?? []).map((o) => o.id))
        const other = values.find((v) => !known.has(v))
        input.checked = other !== undefined
        field.hidden = !input.checked
        field.value = other ?? ''
        const publish = () => {
          values = values.filter((v) => known.has(v))
          if (input.checked) {
            if (!multi) values = []
            values.push(field.value)
          }
          onChange(
            multi
              ? [...values]
              : input.checked
              ? field.value
              : values[0] ?? null
          )
        }
        input.onchange = () => {
          field.hidden = !input.checked
          publish()
          if (input.checked) field.focus()
        }
        field.oninput = publish
        label.append(input, el('span', '', 'Other'))
        group.append(label, field)
      }
      parent.append(group)
      return
    }
    if (q.type === 'ranking') {
      let values = Array.isArray(initial)
        ? [...initial]
        : (q.items ?? []).map((i) => i.id)
      onChange(values)
      const group = el('div', 'ug-options')
      const draw = () => {
        group.replaceChildren()
        values.forEach((id, index) => {
          const row = el('div', 'ug-rank')
          row.append(
            el('span', '', q.items?.find((i) => i.id === id)?.label ?? id)
          )
          for (const [label, step] of [
            ['Move up', -1],
            ['Move down', 1],
          ] as const) {
            const button = el('button', '', step < 0 ? '↑' : '↓')
            button.setAttribute(
              'aria-label',
              `${label}: ${q.items?.find((i) => i.id === id)?.label ?? id}`
            )
            button.disabled = index + step < 0 || index + step >= values.length
            button.onclick = () => {
              ;[values[index], values[index + step]] = [
                values[index + step]!,
                values[index]!,
              ]
              onChange([...values])
              draw()
            }
            row.append(button)
          }
          group.append(row)
        })
      }
      draw()
      parent.append(group)
      return
    }
    if (q.type === 'info_screen') {
      onChange(null)
      return
    }
    const input =
      q.type === 'single_date'
        ? el('input', 'ug-input')
        : el('textarea', 'ug-input')
    if (input instanceof HTMLInputElement) {
      input.type = 'date'
      if (q.minDate) input.min = q.minDate
      if (q.maxDate) input.max = q.maxDate
    }
    input.setAttribute('aria-label', q.title)
    input.value = typeof initial === 'string' ? initial : ''
    input.placeholder = q.placeholder ?? 'Your answer'
    input.maxLength = q.maxLength ?? q.validation?.maxLength ?? 10000
    input.oninput = () => onChange(input.value)
    parent.append(input)
  }
  close(notify = true) {
    if (this.dismissTimer) clearTimeout(this.dismissTimer)
    this.dismissTimer = undefined
    const callback = this.closeHandler
    this.closeHandler = undefined
    this.root?.remove()
    this.root = undefined
    for (const [node, inert] of this.inert) node.inert = inert
    this.inert = []
    this.previousFocus?.focus()
    this.previousFocus = null
    if (notify) callback?.()
  }
  destroy() {
    this.close(false)
    this.host.remove()
  }
}
