// ==========================================================
// Preset themes for the Feedback Design step. 12 curated
// presets + a custom-your-own option in the UI. Each preset
// surfaces 3 swatches in the gallery card for quick scan.
// ==========================================================

export interface ThemeColors {
  readonly primary: string
  readonly background: string
  readonly text: string
  readonly subtext: string
  readonly border: string
  readonly accent?: string
  readonly button?: string
}

export type CornerRadiusPreset = 'sharp' | 'soft' | 'rounded' | 'pill'

export const RADIUS_PRESETS: Record<CornerRadiusPreset, number> = {
  sharp: 4,
  soft: 12,
  rounded: 20,
  pill: 999,
}

export interface ThemePreset {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly colors: ThemeColors
  readonly radius: number
  readonly fontFamily: string
  readonly swatches: readonly [string, string, string]
}

// Default font family for every preset. Matches the SDK's
// DEFAULT_THEME so a freshly-saved theme renders the same in the
// dashboard preview (web font loaded via next/font + Google Fonts
// stylesheet) and on the mobile app (host bundles the .ttf via
// react-native.config.js). Previously the presets used 'Inter',
// which neither side had loaded — both fell back to system sans,
// so designers saw a font drift between the dashboard and device.
const JAKARTA = 'Plus Jakarta Sans'

export const THEME_PRESETS: ReadonlyArray<ThemePreset> = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean neutral palette',
    colors: {
      primary: '#111827',
      background: '#FFFFFF',
      text: '#111827',
      subtext: '#6B7280',
      border: '#E5E7EB',
      button: '#111827',
    },
    radius: 16,
    fontFamily: JAKARTA,
    swatches: ['#111827', '#FFFFFF', '#E5E7EB'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool blue tones',
    colors: {
      primary: '#0EA5E9',
      background: '#F0F9FF',
      text: '#0C4A6E',
      subtext: '#0369A1',
      border: '#BAE6FD',
      button: '#0EA5E9',
    },
    radius: 16,
    fontFamily: JAKARTA,
    swatches: ['#0EA5E9', '#0C4A6E', '#BAE6FD'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange glow',
    colors: {
      primary: '#F97316',
      background: '#FFF7ED',
      text: '#7C2D12',
      subtext: '#C2410C',
      border: '#FED7AA',
      button: '#F97316',
    },
    radius: 16,
    fontFamily: JAKARTA,
    swatches: ['#F97316', '#7C2D12', '#FED7AA'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green hues',
    colors: {
      primary: '#16A34A',
      background: '#F0FDF4',
      text: '#14532D',
      subtext: '#166534',
      border: '#BBF7D0',
      button: '#16A34A',
    },
    radius: 16,
    fontFamily: JAKARTA,
    swatches: ['#16A34A', '#14532D', '#BBF7D0'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep dark mode',
    colors: {
      primary: '#A78BFA',
      background: '#0F172A',
      text: '#F8FAFC',
      subtext: '#94A3B8',
      border: '#1E293B',
      button: '#A78BFA',
    },
    radius: 16,
    fontFamily: JAKARTA,
    swatches: ['#A78BFA', '#0F172A', '#1E293B'],
  },
  {
    id: 'candy',
    name: 'Candy',
    description: 'Playful pink + violet',
    colors: {
      primary: '#EC4899',
      background: '#FDF2F8',
      text: '#831843',
      subtext: '#BE185D',
      border: '#FBCFE8',
      button: '#EC4899',
    },
    radius: 20,
    fontFamily: JAKARTA,
    swatches: ['#EC4899', '#831843', '#FBCFE8'],
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'High-contrast B&W',
    colors: {
      primary: '#000000',
      background: '#FFFFFF',
      text: '#000000',
      subtext: '#525252',
      border: '#000000',
      button: '#000000',
    },
    radius: 4,
    fontFamily: JAKARTA,
    swatches: ['#000000', '#FFFFFF', '#525252'],
  },
  {
    id: 'coral',
    name: 'Coral',
    description: 'Soft coral accent',
    colors: {
      primary: '#FB7185',
      background: '#FFF1F2',
      text: '#881337',
      subtext: '#9F1239',
      border: '#FECDD3',
      button: '#FB7185',
    },
    radius: 16,
    fontFamily: JAKARTA,
    swatches: ['#FB7185', '#881337', '#FECDD3'],
  },
  {
    id: 'ink',
    name: 'Ink',
    description: 'Deep navy editorial',
    colors: {
      primary: '#1E3A8A',
      background: '#F8FAFC',
      text: '#0F172A',
      subtext: '#475569',
      border: '#CBD5E1',
      button: '#1E3A8A',
    },
    radius: 12,
    fontFamily: JAKARTA,
    swatches: ['#1E3A8A', '#0F172A', '#CBD5E1'],
  },
  {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh teal vibe',
    colors: {
      primary: '#14B8A6',
      background: '#F0FDFA',
      text: '#134E4A',
      subtext: '#0F766E',
      border: '#99F6E4',
      button: '#14B8A6',
    },
    radius: 16,
    fontFamily: JAKARTA,
    swatches: ['#14B8A6', '#134E4A', '#99F6E4'],
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Quiet professional',
    colors: {
      primary: '#475569',
      background: '#F1F5F9',
      text: '#0F172A',
      subtext: '#64748B',
      border: '#CBD5E1',
      button: '#475569',
    },
    radius: 12,
    fontFamily: JAKARTA,
    swatches: ['#475569', '#0F172A', '#CBD5E1'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Vibrant gradient pop',
    colors: {
      primary: '#8B5CF6',
      background: '#FAF5FF',
      text: '#3B0764',
      subtext: '#7E22CE',
      border: '#E9D5FF',
      accent: '#EC4899',
      button: '#8B5CF6',
    },
    radius: 20,
    fontFamily: JAKARTA,
    swatches: ['#8B5CF6', '#EC4899', '#E9D5FF'],
  },
] as const

export function getThemePresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id)
}

export function defaultThemePreset(): ThemePreset {
  // The presets list is non-empty by construction; assert via index access.
  return THEME_PRESETS[0] as ThemePreset
}
