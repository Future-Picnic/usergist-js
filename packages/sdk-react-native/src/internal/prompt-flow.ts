import type { Question } from '@usergist/sdk-core/mobile'

function hasNpsFollowUp(question: Question): boolean {
  return question.type === 'nps' && Boolean(question.followUp)
}

/** Tap selections advance immediately unless the current question has more input. */
export function promptShouldAutoAdvance(question: Question): boolean {
  if (question.type === 'rating') return true
  if (question.type === 'nps') return !hasNpsFollowUp(question)
  if (question.type === 'multiple_choice') return !question.multiSelect
  return false
}

/** Questions that need a deliberate Next action after their answer is selected. */
export function promptNeedsExplicitNext(question: Question): boolean {
  if (question.type === 'short_text') return true
  if (question.type === 'nps') return hasNpsFollowUp(question)
  return question.type === 'multiple_choice' && Boolean(question.multiSelect)
}

/** Explicit Next is gated when its question first requires a primary answer. */
export function promptNextRequiresAnswer(question: Question): boolean {
  return question.type === 'short_text' || hasNpsFollowUp(question)
}
