import { describe, expect, it } from 'vitest'
import type { Question } from '@usergist/sdk-core/mobile'
import {
  promptNeedsExplicitNext,
  promptNextRequiresAnswer,
  promptShouldAutoAdvance,
} from './prompt-flow.js'

function question(value: Partial<Question> & Pick<Question, 'type' | 'id' | 'title'>): Question {
  return value as Question
}

describe('prompt navigation policy', () => {
  it('keeps an NPS follow-up open while ordinary NPS still auto-advances', () => {
    const plain = question({ type: 'nps', id: 'plain', title: 'Recommend?' })
    const withFollowUp = question({
      type: 'nps',
      id: 'follow-up',
      title: 'Recommend?',
      followUp: 'What led to your score?',
    })

    expect(promptShouldAutoAdvance(plain)).toBe(true)
    expect(promptNeedsExplicitNext(plain)).toBe(false)
    expect(promptShouldAutoAdvance(withFollowUp)).toBe(false)
    expect(promptNeedsExplicitNext(withFollowUp)).toBe(true)
    expect(promptNextRequiresAnswer(withFollowUp)).toBe(true)
  })

  it('preserves rating, single-choice, multi-choice, and text policies', () => {
    const rating = question({ type: 'rating', id: 'rating', title: 'Rate' })
    const single = question({
      type: 'multiple_choice',
      id: 'single',
      title: 'Pick one',
      multiSelect: false,
    })
    const multi = question({
      type: 'multiple_choice',
      id: 'multi',
      title: 'Pick several',
      multiSelect: true,
    })
    const text = question({ type: 'short_text', id: 'text', title: 'Explain' })

    expect(promptShouldAutoAdvance(rating)).toBe(true)
    expect(promptShouldAutoAdvance(single)).toBe(true)
    expect(promptNeedsExplicitNext(multi)).toBe(true)
    expect(promptNextRequiresAnswer(multi)).toBe(false)
    expect(promptNeedsExplicitNext(text)).toBe(true)
    expect(promptNextRequiresAnswer(text)).toBe(true)
  })
})
