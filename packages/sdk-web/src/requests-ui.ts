import type { UserGistClient } from './client.js'
export type RequestClient = Pick<
  UserGistClient,
  | 'getRequestBranding'
  | 'getRequests'
  | 'getRequest'
  | 'getComments'
  | 'submitRequest'
  | 'voteOnRequest'
  | 'followRequest'
  | 'postComment'
  | 'editComment'
  | 'deleteComment'
>
import { el, type WebRenderer } from './renderer.js'

const queuedMessage =
  'Saved on this browser. We’ll send it when the connection returns.'
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unable to load. Please try again.'
}
export async function showRequestBoard(
  client: RequestClient,
  renderer: WebRenderer
) {
  const branding = await client.getRequestBranding()
  renderer.setTheme({ colors: { primary: branding.accentColor ?? undefined } })
  const surface = renderer.frame(
    'requests',
    branding.entryLabel || 'Feature requests',
    { size: 'wide' }
  )
  const content = el('div', 'ug-content')
  renderer.header(
    content,
    branding.entryLabel || 'Feature requests',
    branding.introCopy ||
      'Share an idea, support a request, and follow its progress.',
    branding.logoUrl
  )
  surface.append(content)
  const toolbar = el('div', 'ug-toolbar')
  const search = el('input', 'ug-input')
  search.type = 'search'
  search.placeholder = 'Search requests'
  search.setAttribute('aria-label', 'Search requests')
  const sort = el('select')
  sort.setAttribute('aria-label', 'Sort requests')
  for (const [value, label] of [
    ['top', 'Most supported'],
    ['newest', 'Newest'],
    ['recently_updated', 'Recently updated'],
  ]) {
    const option = el('option', '', label)
    option.value = value!
    sort.append(option)
  }
  const create = renderer.button('Share an idea', () =>
    showSubmit(client, renderer)
  )
  toolbar.append(search, sort, create)
  content.append(toolbar)
  const list = el('div', 'ug-list')
  list.setAttribute('aria-live', 'polite')
  content.append(list)
  let generation = 0
  const load = async () => {
    const current = ++generation
    list.replaceChildren(el('p', '', 'Loading requests…'))
    try {
      const result = await client.getRequests({
        q: search.value,
        sort: sort.value,
      })
      if (current !== generation || !surface.isConnected) return
      list.replaceChildren()
      if (!result.items.length)
        list.append(el('p', '', 'No requests match yet. Share the first idea.'))
      for (const item of result.items) {
        const button = el('button', 'ug-list-item')
        button.append(
          el('strong', '', item.title),
          el(
            'small',
            '',
            `${item.upvoteCount} votes · ${item.status.replaceAll('_', ' ')}`
          )
        )
        button.onclick = () => {
          void showRequestDetail(client, renderer, item.id)
        }
        list.append(button)
      }
      if (result.nextCursor) {
        let cursor: string | null = result.nextCursor
        const more = renderer.button('Load more', async () => {
          more.disabled = true
          try {
            const next = await client.getRequests({
              q: search.value,
              sort: sort.value,
              cursor: cursor!,
            })
            if (current !== generation || !surface.isConnected) return
            for (const item of next.items) {
              const button = el('button', 'ug-list-item')
              button.append(el('strong', '', item.title))
              button.onclick = () => {
                void showRequestDetail(client, renderer, item.id)
              }
              list.insertBefore(button, more)
            }
            cursor = next.nextCursor ?? null
            if (!cursor) more.remove()
            else more.disabled = false
          } catch (e) {
            list.append(el('p', 'ug-error', errorMessage(e)))
            more.disabled = false
          }
        })
        list.append(more)
      }
    } catch (error) {
      if (current === generation) {
        list.replaceChildren(
          el('p', 'ug-error', errorMessage(error)),
          renderer.button(
            'Try again',
            () => {
              void load()
            },
            true
          )
        )
      }
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  search.oninput = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void load()
    }, 250)
  }
  sort.onchange = () => {
    void load()
  }
  await load()
}
function showSubmit(client: RequestClient, renderer: WebRenderer) {
  const surface = renderer.frame('requests', 'Share an idea')
  const content = el('div', 'ug-content')
  renderer.header(
    content,
    'Share an idea',
    'Tell the team what would make your experience better.'
  )
  const title = el('input', 'ug-input')
  title.placeholder = 'A short, clear title'
  title.maxLength = 120
  title.setAttribute('aria-label', 'Request title')
  const description = el('textarea', 'ug-input')
  description.placeholder = 'What would you like to do, and why?'
  description.maxLength = 1500
  description.setAttribute('aria-label', 'Request description')
  const error = el('p', 'ug-error')
  error.setAttribute('role', 'alert')
  content.append(title, description, error)
  const footer = el('div', 'ug-footer')
  const send = renderer.button('Submit idea', async () => {
    if (!title.value.trim() || !description.value.trim()) {
      error.textContent = 'Add a title and description.'
      return
    }
    send.disabled = true
    try {
      const request = await client.submitRequest(
        title.value.trim(),
        description.value.trim()
      )
      if ('queued' in request) {
        error.textContent = queuedMessage
        error.setAttribute('role', 'status')
        return
      }
      await showRequestDetail(client, renderer, request.id)
    } catch (e) {
      error.textContent = errorMessage(e)
      send.disabled = false
    }
  })
  footer.append(
    renderer.button(
      'Back',
      () => {
        void showRequestBoard(client, renderer)
      },
      true
    ),
    send
  )
  surface.append(content, footer)
}
export async function showRequestDetail(
  client: RequestClient,
  renderer: WebRenderer,
  id: string
) {
  const surface = renderer.frame('requests', 'Request details', {
    size: 'wide',
  })
  const content = el('div', 'ug-content')
  content.append(el('p', '', 'Loading request…'))
  surface.append(content)
  try {
    const [request, comments] = await Promise.all([
      client.getRequest(id),
      client.getComments(id),
    ])
    if (!surface.isConnected) return
    content.replaceChildren()
    content.append(
      renderer.button(
        'All requests',
        () => {
          void showRequestBoard(client, renderer)
        },
        true
      )
    )
    renderer.header(content, request.title, request.description)
    content.append(el('div', 'ug-meta', request.status.replaceAll('_', ' ')))
    const actions = el('div', 'ug-toolbar')
    let voted = request.viewerHasUpvoted,
      following = request.viewerIsFollowing
    const error = el('p', 'ug-error')
    error.setAttribute('role', 'alert')
    const vote = renderer.button(
      `${voted ? 'Supported' : 'Support'} · ${request.upvoteCount}`,
      async () => {
        vote.disabled = true
        try {
          const result = await client.voteOnRequest(id, !voted)
          if ('queued' in result) {
            error.textContent = queuedMessage
            return
          }
          voted = result.upvoted
          vote.textContent = `${voted ? 'Supported' : 'Support'} · ${
            result.upvoteCount
          }`
          vote.setAttribute('aria-pressed', String(voted))
        } catch (e) {
          error.textContent = errorMessage(e)
        } finally {
          vote.disabled = false
        }
      }
    )
    vote.setAttribute('aria-pressed', String(voted))
    const follow = renderer.button(
      following ? 'Following' : 'Follow updates',
      async () => {
        follow.disabled = true
        try {
          const result = await client.followRequest(id, !following)
          if ('queued' in result) {
            error.textContent = queuedMessage
            return
          }
          following = result.following
          follow.textContent = following ? 'Following' : 'Follow updates'
          follow.setAttribute('aria-pressed', String(following))
        } catch (e) {
          error.textContent = errorMessage(e)
        } finally {
          follow.disabled = false
        }
      },
      true
    )
    follow.setAttribute('aria-pressed', String(following))
    actions.append(vote, follow)
    content.append(actions, error)
    if (request.devResponse) {
      content.append(
        el('h3', '', 'Team response'),
        el('p', '', request.devResponse)
      )
    }
    content.append(el('h3', '', 'Discussion'))
    for (const comment of comments) {
      const row = el('div', 'ug-comment')
      row.append(
        el('small', '', comment.authorExternalId ?? 'Anonymous participant')
      )
      const body = el('p', '', comment.body)
      row.append(body)
      if (comment.viewerIsAuthor) {
        const edit = el('button', 'ug-link', 'Edit')
        edit.onclick = () => {
          const field = el('textarea', 'ug-input')
          field.maxLength = 1000
          field.value = comment.body
          field.setAttribute('aria-label', 'Edit comment')
          body.replaceWith(field)
          edit.disabled = true
          const save = renderer.button('Save', async () => {
            save.disabled = true
            try {
              const result = await client.editComment(
                id,
                comment.id,
                field.value
              )
              if ('queued' in result) {
                error.textContent = queuedMessage
                return
              }
              await showRequestDetail(client, renderer, id)
            } catch (e) {
              error.textContent = errorMessage(e)
              save.disabled = false
            }
          })
          row.append(save)
        }
        const remove = el('button', 'ug-link', 'Delete')
        remove.onclick = () => {
          remove.textContent = 'Confirm delete'
          remove.onclick = async () => {
            remove.disabled = true
            try {
              const result = await client.deleteComment(id, comment.id)
              if (result && 'queued' in result) {
                error.textContent = queuedMessage
                return
              }
              await showRequestDetail(client, renderer, id)
            } catch (e) {
              error.textContent = errorMessage(e)
              remove.disabled = false
            }
          }
        }
        row.append(edit, remove)
      }
      content.append(row)
    }
    const input = el('textarea', 'ug-input')
    input.placeholder = 'Add your thoughts'
    input.maxLength = 1000
    input.setAttribute('aria-label', 'New comment')
    const send = renderer.button('Post comment', async () => {
      if (!input.value.trim()) return
      send.disabled = true
      try {
        const result = await client.postComment(id, input.value.trim())
        if ('queued' in result) {
          error.textContent = queuedMessage
          return
        }
        await showRequestDetail(client, renderer, id)
      } catch (e) {
        error.textContent = errorMessage(e)
        send.disabled = false
      }
    })
    content.append(input, send)
  } catch (error) {
    content.replaceChildren(
      el('p', 'ug-error', errorMessage(error)),
      renderer.button(
        'Try again',
        () => {
          void showRequestDetail(client, renderer, id)
        },
        true
      )
    )
  }
}
