// Builds IngestContext for outgoing batches.
// Pulls from react-native Platform + NativeModules when available. All lookups
// are defensive — if a host doesn't expose a field, we simply omit it.

import type { IngestContext, SdkPlatform } from '@usergist/sdk-core/mobile'

export const USERGIST_SDK_VERSION = '0.1.0'

type PlatformLike = {
  readonly OS?: string
  readonly Version?: string | number
  readonly constants?: Readonly<Record<string, unknown>>
}

declare const require: (id: string) => unknown

function loadPlatform(): PlatformLike | null {
  try {
    const rn = require('react-native') as { Platform?: PlatformLike } | undefined
    return rn?.Platform ?? null
  } catch {
    return null
  }
}

function resolveIntlOptions(): { locale?: string; timeZone?: string } {
  try {
    // Intl is a standard lib global under ES2022; guard in case a runtime
    // strips it.
    const intl = (globalThis as unknown as { Intl?: typeof Intl }).Intl
    if (!intl) return {}
    const opts = new intl.DateTimeFormat().resolvedOptions()
    return { locale: opts.locale, timeZone: opts.timeZone }
  } catch {
    return {}
  }
}

function deviceLocale(): string | undefined {
  return resolveIntlOptions().locale
}

function deviceTimezone(): string | undefined {
  return resolveIntlOptions().timeZone
}

function mapPlatform(os: string | undefined): SdkPlatform {
  switch (os) {
    case 'ios':
      return 'ios'
    case 'android':
      return 'android'
    default:
      return 'react-native'
  }
}

export interface ContextProvider {
  readonly build: (params: {
    readonly anonymousId: string
    readonly externalId: string | null
  }) => IngestContext
  readonly sdkVersion: () => string
  readonly platform: () => SdkPlatform
}

export function createContextProvider(appVersion?: string | null): ContextProvider {
  const platform = loadPlatform()
  const os = typeof platform?.OS === 'string' ? platform.OS : undefined
  const osVersion =
    platform?.Version != null ? String(platform.Version) : undefined
  const sdkPlatform = mapPlatform(os)
  const locale = deviceLocale()
  const timezone = deviceTimezone()

  return {
    sdkVersion: () => USERGIST_SDK_VERSION,
    platform: () => sdkPlatform,
    build({ anonymousId, externalId }) {
      const ctx: IngestContext = {
        anonymousId,
        externalId: externalId ?? null,
        sdkVersion: USERGIST_SDK_VERSION,
        platform: sdkPlatform,
        ...(appVersion ? { appVersion } : {}),
        ...(os ? { osName: os } : {}),
        ...(osVersion ? { osVersion } : {}),
        ...(locale ? { locale } : {}),
        ...(timezone ? { timezone } : {}),
      }
      return ctx
    },
  }
}
