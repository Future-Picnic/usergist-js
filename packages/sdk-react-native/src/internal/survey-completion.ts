import type { MutationQueue } from './mutation-queue.js'
import type { MutationFlushResult } from './engine.js'

export type SurveyCompletionOutcome = 'delivered' | 'deferred' | 'rejected'

/**
 * A durably queued completion is accepted by the SDK even when the network
 * cannot deliver it immediately. Only a permanent server rejection should
 * keep the survey on its final question.
 */
export function surveyCompletionOutcome(
  mutationId: string,
  mutations: Pick<MutationQueue, 'has'>,
  result: MutationFlushResult,
): SurveyCompletionOutcome {
  if (result.permanentlyRejectedIds.has(mutationId)) return 'rejected'
  return mutations.has(mutationId) ? 'deferred' : 'delivered'
}
