import { z } from 'zod'

export const deliveryPlatformsSchema = z.array(z.enum(['ios', 'android', 'web'])).min(1).max(3)
  .transform((values) => [...new Set(values)])
export const webPresentationSchema = z.object({
  layout: z.enum(['modal', 'card', 'panel']).optional(),
  size: z.enum(['compact', 'standard', 'wide']).optional(),
  position: z.enum(['left', 'right']).optional(),
  backdrop: z.boolean().optional(),
}).strict()
export const webOriginSchema = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return url.origin === value && !url.username && !url.password &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  } catch { return false }
}, 'Use an exact HTTPS origin, or an HTTP localhost origin for development')
export const webAppConfigSchema = z.object({
  allowedOrigins: z.array(webOriginSchema).max(30).transform((values) => [...new Set(values)]),
}).strict()
