export type AnswerValue =
  | number
  | string
  | ReadonlyArray<string>
  | null

export interface ResponseAnswer {
  readonly questionId: string
  readonly value: AnswerValue
}

export interface PromptResponse {
  readonly id: string
  readonly appId: string
  readonly promptId: string
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly answers: ReadonlyArray<ResponseAnswer>
  readonly dismissed: boolean
  readonly latencyMs?: number
  readonly createdAt: string
}

export interface SubmitResponsePayload {
  readonly promptId: string
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly answers?: ReadonlyArray<ResponseAnswer>
  readonly dismissed?: boolean
  readonly latencyMs?: number
}
