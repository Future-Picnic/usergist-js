import type { ResponseEmission } from './types.js'

export type PromptAnswerValue = number | string | ReadonlyArray<string> | null
export type PromptAnswerRecord = Readonly<Record<string, PromptAnswerValue>>

export function withPromptAnswer(
  current: PromptAnswerRecord,
  questionId: string,
  value: PromptAnswerValue,
): PromptAnswerRecord {
  return { ...current, [questionId]: value }
}

export function promptResponseAnswers(
  current: PromptAnswerRecord,
): ResponseEmission['answers'] {
  return Object.keys(current).map((questionId) => ({
    questionId,
    value: current[questionId] ?? null,
  }))
}
