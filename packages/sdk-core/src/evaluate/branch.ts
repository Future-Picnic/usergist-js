// ============================================================
// Branch DSL evaluator — shared by SDKs and dashboard preview.
// Given a flow, a current question, and the answer just recorded,
// returns the next question id (or SURVEY_END_SENTINEL).
// ============================================================

import {
  SURVEY_END_SENTINEL,
  type SurveyAnswerRecord,
  type SurveyAnswerValue,
  type SurveyBranch,
  type SurveyBranchCondition,
  type SurveyFlow,
  type SurveyQuestion,
} from '../types/survey.js'

export function evaluateBranchCondition(
  cond: SurveyBranchCondition,
  answer: SurveyAnswerValue | undefined,
): boolean {
  if (cond.op === 'answered') return answer !== undefined && answer !== null && answer !== ''
  if (cond.op === 'unanswered') return answer === undefined || answer === null || answer === ''
  if (answer === undefined || answer === null) return false

  switch (cond.op) {
    case 'eq':
      return answer === cond.value
    case 'neq':
      return answer !== cond.value
    case 'lt':
      return typeof answer === 'number' && typeof cond.value === 'number' && answer < cond.value
    case 'lte':
      return typeof answer === 'number' && typeof cond.value === 'number' && answer <= cond.value
    case 'gt':
      return typeof answer === 'number' && typeof cond.value === 'number' && answer > cond.value
    case 'gte':
      return typeof answer === 'number' && typeof cond.value === 'number' && answer >= cond.value
    case 'includes':
      return Array.isArray(answer) && (answer as ReadonlyArray<unknown>).includes(cond.value as never)
    case 'not_includes':
      return Array.isArray(answer) && !(answer as ReadonlyArray<unknown>).includes(cond.value as never)
    default:
      return false
  }
}

export function nextQuestionId(
  flow: SurveyFlow,
  currentQuestionId: string,
  answers: SurveyAnswerRecord,
): string | null {
  const branches = flow.branches.filter((b) => b.fromQuestionId === currentQuestionId)
  const answer = answers[currentQuestionId]
  for (const branch of branches) {
    if (evaluateBranchCondition(branch.condition, answer)) {
      if (branch.toQuestionId === SURVEY_END_SENTINEL) return null
      return branch.toQuestionId
    }
  }
  return defaultNext(flow, currentQuestionId)
}

function defaultNext(flow: SurveyFlow, currentQuestionId: string): string | null {
  const idx = flow.questions.findIndex((q) => q.id === currentQuestionId)
  if (idx < 0 || idx >= flow.questions.length - 1) return null
  const next = flow.questions[idx + 1]
  return next ? next.id : null
}

export function findQuestion(
  flow: SurveyFlow,
  questionId: string,
): SurveyQuestion | undefined {
  return flow.questions.find((q) => q.id === questionId)
}

export function findQuestionIndex(flow: SurveyFlow, questionId: string): number {
  return flow.questions.findIndex((q) => q.id === questionId)
}

// Conservative progress estimate: count the current index + 1 over total. Branching
// makes an exact number impossible, so we expose the worst-case fraction.
export function estimateProgress(flow: SurveyFlow, currentQuestionId: string | null): number {
  if (!currentQuestionId) return 1
  const idx = findQuestionIndex(flow, currentQuestionId)
  if (idx < 0) return 0
  return (idx + 1) / Math.max(1, flow.questions.length)
}

// Given a branch filter list, compute the *reachable* set of questions from a starting
// point. Used by the composer to render "dead question" warnings.
export function reachableQuestions(
  flow: SurveyFlow,
  startId?: string,
): ReadonlySet<string> {
  const start = startId ?? flow.startQuestionId
  const visited = new Set<string>()
  const stack: string[] = [start]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined) continue
    if (visited.has(id)) continue
    visited.add(id)
    const outgoing = flow.branches.filter((b) => b.fromQuestionId === id)
    for (const b of outgoing) {
      if (b.toQuestionId !== SURVEY_END_SENTINEL) stack.push(b.toQuestionId)
    }
    const idx = flow.questions.findIndex((q) => q.id === id)
    if (idx >= 0 && idx < flow.questions.length - 1) {
      const next = flow.questions[idx + 1]
      if (next) stack.push(next.id)
    }
  }
  return visited
}
