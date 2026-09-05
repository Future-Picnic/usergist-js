import type { Request as RequestDto } from '@usergist/sdk-core/client'
import { WebRenderer, type RenderExperience } from './renderer.js'
import { showRequestBoard, type RequestClient } from './requests-ui.js'
export type { RenderExperience, RenderQuestion } from './renderer.js'

function requestPreview(experience: RenderExperience): RequestClient {
  const items: RequestDto[] = [
    'Improved search',
    'Dark mode',
    'More integrations',
  ].map((title, index) => ({
    id: String(index),
    appId: 'preview',
    title,
    description: 'Share your thoughts with the product team.',
    status: index === 0 ? 'planned' : 'under_review',
    upvoteCount: 18 - index * 5,
    followerCount: 4,
    devResponse: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    statusChangedAt: '2026-01-01T00:00:00Z',
    lastRespondedAt: null,
    viewerHasUpvoted: false,
    viewerIsFollowing: false,
    viewerIsSubmitter: false,
  }))
  const get = (id: string) => items.find((item) => item.id === id) ?? items[0]!
  const queued = async () => ({ queued: true as const, pendingId: 'preview' })
  return {
    getRequestBranding: async () => ({
      entryLabel: experience.requestBranding?.entryLabel ?? 'Feature requests',
      introCopy: experience.requestBranding?.introCopy ?? null,
      logoUrl: experience.requestBranding?.logoUrl ?? null,
      accentColor: experience.theme?.colors?.primary ?? null,
    }),
    getRequests: async (options) => ({
      items: items.filter((item) =>
        item.title.toLowerCase().includes((options?.q ?? '').toLowerCase())
      ),
      nextCursor: null,
    }),
    getRequest: async (id) => get(id),
    getComments: async () => [],
    submitRequest: queued,
    postComment: queued,
    editComment: queued,
    deleteComment: queued,
    voteOnRequest: async (id, vote) => ({
      requestId: id,
      upvoted: vote,
      followed: vote,
      upvoteCount: get(id).upvoteCount + (vote ? 1 : 0),
      followerCount: 4,
    }),
    followRequest: async (id, follow) => ({
      requestId: id,
      following: follow,
      followerCount: 4 + (follow ? 1 : 0),
      source: 'manual',
    }),
  }
}
export function mountPreview(
  container: HTMLElement,
  experience: RenderExperience,
  options: { nonce?: string } = {}
) {
  const renderer = new WebRenderer({
    container,
    preview: true,
    nonce: options.nonce,
  })
  const show = (value: RenderExperience) => {
    if (value.pillar === 'requests') {
      void showRequestBoard(requestPreview(value), renderer)
      return
    }
    renderer.show({
      ...value,
      onSubmit: async () => {},
      onProgress: async () => {},
      onDismiss: () => {},
      onCta: () => {},
    })
  }
  show(experience)
  return {
    update: show,
    destroy() {
      renderer.destroy()
    },
  }
}
