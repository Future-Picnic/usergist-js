/** Delivery platform is independent of the customer's integration framework. */
export type DeliveryPlatform = 'ios' | 'android' | 'web'
export type WebLayout = 'modal' | 'card' | 'panel'
export interface WebPresentation {
  readonly layout?: WebLayout
  readonly size?: 'compact' | 'standard' | 'wide'
  readonly position?: 'left' | 'right'
  readonly backdrop?: boolean
}
export interface CampaignDeliveryOptions {
  readonly deliveryPlatforms?: ReadonlyArray<DeliveryPlatform>
  readonly webPresentation?: WebPresentation | null
}
export interface WebAppConfig {
  /** Exact origins, including scheme and non-default port. */
  readonly allowedOrigins: ReadonlyArray<string>
}
export const DELIVERY_PROTOCOL_VERSION = 2 as const
export function deliveryPlatformsForApp(platforms: ReadonlyArray<string>): DeliveryPlatform[] {
  const values = new Set<DeliveryPlatform>()
  for (const platform of platforms) {
    if (platform === 'web' || platform === 'ios' || platform === 'android') values.add(platform)
    if (platform === 'react-native' || platform === 'flutter') {
      values.add('ios'); values.add('android')
    }
  }
  return [...values]
}
export function resolveWebPresentation(pillar: 'feedback' | 'survey' | 'inapp' | 'requests', override?: WebPresentation | null) {
  return {
    layout: override?.layout ?? 'modal',
    size: override?.size ?? (pillar === 'requests' ? 'wide' : 'standard'),
    position: override?.position ?? 'right',
    backdrop: override?.backdrop ?? override?.layout !== 'card',
  } as const
}
