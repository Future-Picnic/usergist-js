# Changelog

## 0.1.1

- Queue identification behind anonymous activation without falsely reporting the wrong identity as synced.
- Retire the previous anonymous credentials and storage after transferring pending work to the identified session.
- Cancel request-board presentation when consent is withdrawn or the session changes while loading.
- Use strictly increasing consent versions for rapid updates and clock adjustments.

## 0.1.0

- Add framework-independent browser support for feedback, surveys, in-app messages and feature requests.
- Keep initialization inactive; require explicit identification or anonymous opt-in.
- Add scoped sessions, consent, durable mutation queues, app-origin validation and coordinated campaign delivery.
- Add responsive Shadow DOM components, optional React hooks and a standalone script.
- Ship self-contained runtime and TypeScript declarations, with no required runtime dependencies.
- Support ESM and CommonJS imports, including React and preview entry points.
- Preserve the React client boundary for Next.js consumers.
- Share the browser renderer with dashboard previews and the private internal web lab.
