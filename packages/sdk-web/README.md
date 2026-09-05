# UserGist for web

`@usergist/feedback-web` supports feedback, surveys, in-app messages and feature requests in desktop and mobile browsers. It has no React dependency at runtime; an optional React entry point is provided.

## Connect an app

Enable **Web** in UserGist app settings and add each exact website origin. Production requires HTTPS. Development keys can use explicitly listed loopback origins such as `http://localhost:21947`. Choose Web in each campaign's delivery platforms. Existing campaigns keep their native reach until edited.

```sh
npm install @usergist/feedback-web
```

```ts
import { createUserGist } from '@usergist/feedback-web'

export const usergist = createUserGist()
await usergist.init({
  writeKey: 'ug_your_public_write_key',
  getSubjectToken: async () => {
    // Your authenticated backend derives the user ID from its own session.
    const response = await fetch('/api/usergist-token', { method: 'POST' })
    if (!response.ok) throw new Error('Sign in again')
    return (await response.json()).subjectToken
  },
})

// Call after the host has decided this signed-in user should participate.
await usergist.setConsent({ analytics: true, feedback: true, survey: true })
const result = await usergist.identify(currentUser.id)
if (result !== 'synced') return

usergist.setPageContext({ screenName: 'account' })
usergist.track('checkout_completed', { item_count: 2 })
await usergist.openFeedback('your-prompt-id')
```

`init()` performs no network requests, creates no visitor identity, opens no storage, and mounts no UI. Consent alone does not activate participation. Identification requires a server-minted subject token. Your backend must authenticate the host user and mint a token for that user; never trust an arbitrary user ID supplied by the browser. Keep the management API token on your backend. The SDK refreshes an expired subject token through `getSubjectToken`.

Analytics is independent of feedback and survey consent. The SDK emits `$app_open` after explicit activation only when analytics consent is granted. It does not collect pageviews, URLs, clicks or form fields automatically. Call `track()` for events and `setPageContext()` for page targeting. No web push, notification permissions, service worker or push credentials are used.

## Anonymous participation and logout

Anonymous web participation is an explicit customer choice:

```ts
await usergist.init({ writeKey: 'ug_...', allowAnonymous: true })
await usergist.setConsent({ feedback: true, survey: true })
await usergist.startAnonymous()
// A later identify(user.id, {}, subjectToken) links the active anonymous alias.
```

Call `await usergist.reset()` on host logout before identifying a different account. It closes UI, cancels in-flight work, clears pending work for the client, ends its server session, and tells other active tabs for that user to reset. It does not withdraw that user's consent or invalidate native push registrations. `destroy()` also releases subscriptions; create a fresh client to use the SDK again.

## Experiences

```ts
await usergist.openFeedback(promptId)
await usergist.openSurvey(surveyId)
const available = await usergist.getAvailableSurveys()
await usergist.handleSurveyLink(surveyLink)
await usergist.openRequestsBoard()
await usergist.openRequestDetail(requestId)
```

Open methods return a status: `opened`, `inactive`, `consent_required`, `unavailable`, or `failed`. Native and web clients use a canonical user-level presentation ledger for web-enabled campaigns. Upgrade native SDKs to the coordinated-delivery release before selecting native + Web on the same campaign; older native versions cannot receive those instructions.

The browser renderer shares campaign content and brand tokens with mobile while supporting dialogs, side panels and corner cards. Surveys use dialogs or panels. Narrow browsers use touch-sized controls and a full-height survey layout. Optional `webPresentation` overrides are campaign-specific. The renderer isolates CSS with Shadow DOM, traps dialog focus, handles Escape, restores host focus, uses safe text content, and respects reduced motion.

The floating launcher is off by default. Enable only the entries needed by your application:

```ts
await usergist.init({
  writeKey: 'ug_...',
  getSubjectToken,
  launcher: { enabled: true, label: 'Feedback', feedbackPromptId, surveys: true, requests: true },
  // Supply these when the host owns navigation:
  onNavigate: url => router.navigate(url),
  onDeepLink: url => handleDeepLink(url),
  onAction: action => handleAction(action),
})
```

Pass `nonce` if the host CSP requires a nonce for injected styles. Permit your UserGist API in `connect-src` and configured campaign image hosts in `img-src`. Supply `container` and `zIndex` when integrating with a host overlay system. Do not mount inside a hidden or inert ancestor.

Feedback, analytics, survey progress, completion, feature-request mutations, and delivery receipts use a bounded, identity-scoped IndexedDB queue. Retries reuse event/response IDs. Pending records expire after seven days. Restricted storage falls back to memory with a diagnostic. Request mutation methods return the server result when connected, or `{ queued: true, pendingId }` when saved for retry. Treat a queued result as accepted locally and avoid asking users to submit it again. Opening new campaigns and loading board content require a connection. Survey progress can resume within the campaign's configured window.

## React and plain JavaScript

```tsx
import { UserGistProvider, useUserGist, useUserGistState } from '@usergist/feedback-web/react'

function FeedbackButton() {
  const sdk = useUserGist()
  const { state } = useUserGistState()
  return <button disabled={state !== 'active-identified'} onClick={() => sdk.openFeedback(promptId)}>Feedback</button>
}
// <UserGistProvider client={usergist}>...</UserGistProvider>
```

The provider never activates or logs out users on mount/unmount. Importing the package during server rendering is safe; call browser methods only on the client.

A bundled script is exported as `@usergist/feedback-web/browser`. Host the built `dist/usergist.global.js` and use `window.UserGist` (the singleton) or `window.UserGistWeb.createUserGist()`. The internal `apps/demo-web/public/plain.html` fixture demonstrates this without React.

## Development

`pnpm build`, `pnpm typecheck`, and `pnpm test` run package checks. `@usergist/feedback-web/preview` exports `mountPreview(container, experience)` and returns `update()` / `destroy()`. It uses the production renderer with networking and submission disabled.

The internal lab is in `apps/demo-web` on port 21947. It is a private workspace package and is not shipped to customers. Follow `apps/demo-web/README.md` for local token-helper setup.
