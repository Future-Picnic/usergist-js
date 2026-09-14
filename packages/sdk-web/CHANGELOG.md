# Changelog

## 0.1.2

- Retain the public Web package’s standalone ESM/CommonJS/React exports and bundled core types.
- Preserve anonymous-to-identified queued work, retire old credentials, and keep consent revisions monotonic.

- Add startup presentation readiness: initialize with `presentationPaused`, then call `resumePresentation()` after the loaded screen is ready.
- Keep analytics and networking running while campaign UI is paused; `pausePresentation()` can protect later host flows without dismissing active UI.
- Invalidate queued presentation work after consent revocation, reset, or identity changes, including requests prepared asynchronously.

## Unreleased

- Add framework-independent browser support for feedback, surveys, in-app messages and feature requests.
- Keep initialization inactive; require explicit identification or anonymous opt-in.
- Add scoped sessions, consent, durable mutation queues, app-origin validation and coordinated campaign delivery.
- Add responsive Shadow DOM components, optional React hooks and a standalone script.
- Share the browser renderer with dashboard previews and the private internal web lab.
