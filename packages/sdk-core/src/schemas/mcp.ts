import { z } from 'zod'
import { MCP_ACCESS_MODES, MCP_CAPABILITIES, MCP_DEFAULT_CAPABILITIES } from '../types/mcp.js'

export const mcpCapabilitySchema = z.string().refine((value) => MCP_CAPABILITIES.includes(value as never), 'Unknown MCP capability')
export const mcpGrantSchema = z.object({
  name: z.string().trim().min(1).max(100).default('AI connection'),
  appIds: z.array(z.string().uuid()).min(1).max(100).refine(v => new Set(v).size === v.length, 'Duplicate app IDs'),
  capabilities: z.array(mcpCapabilitySchema).max(56).default([...MCP_DEFAULT_CAPABILITIES]),
  mode: z.enum(MCP_ACCESS_MODES).default('approve_changes'),
}).strict()
export const mcpConsentSchema = mcpGrantSchema.extend({
  workspaceId: z.string().uuid(),
  externalAuthId: z.string().min(10).max(256).regex(/^[a-zA-Z0-9_-]+$/),
})
export const mcpUpdateConnectionSchema = mcpGrantSchema.extend({ policyVersion: z.number().int().positive() })
export const subjectRefSchema = z.union([
  z.object({ subjectId: z.string().uuid() }).strict(),
  z.object({ externalId: z.string().min(1).max(256) }).strict(),
  z.object({ anonymousId: z.string().min(1).max(256) }).strict(),
])
export const mcpPageSchema = z.object({ cursor: z.string().max(4096).optional(), limit: z.number().int().min(1).max(100).default(25) })
export const mcpSearchSchema = mcpPageSchema.extend({
  query: z.string().trim().min(1).max(500),
  types: z.array(z.enum(['request', 'feedback_answer', 'survey_answer', 'roadmap', 'article', 'changelog'])).max(6).optional(),
  variant: z.enum(['draft', 'published', 'record']).optional(),
})
