import { describe, expect, it } from 'vitest'
import { promptResponseAnswers, withPromptAnswer } from './prompt-answers.js'

describe('prompt response answers', () => {
  it('includes the final tap-to-submit rating in the serialized response', () => {
    const before = {}
    const after = withPromptAnswer(before, 'rating', 5)

    expect(before).toEqual({})
    expect(promptResponseAnswers(after)).toEqual([{ questionId: 'rating', value: 5 }])
  })

  it('preserves earlier answers when the final answer is appended', () => {
    const before = withPromptAnswer({}, 'choice', ['speed'])
    const after = withPromptAnswer(before, 'rating', 4)

    expect(promptResponseAnswers(after)).toEqual([
      { questionId: 'choice', value: ['speed'] },
      { questionId: 'rating', value: 4 },
    ])
  })
})
