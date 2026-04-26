/**
 * Shared Zod schemas — single source of truth for request/response validation.
 *
 * Both the API (Fastify route handlers) and the dashboard (react-hook-form +
 * runtime response validation) import from here. If you change a schema,
 * every consumer sees the new constraint at compile time.
 *
 * Migration is incremental — pillars are landing here pillar-by-pillar. The
 * API still has duplicate schemas under `apps/api/src/schemas/` for the ones
 * not yet moved; those re-export from here to keep import paths stable.
 */
export * from './auth.js'
export * from './apps.js'
export * from './primitives.js'
