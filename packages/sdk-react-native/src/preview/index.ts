// Web-safe preview surface.
//
// What this entry point exposes: pure presentational components that
// render the same JSX as the runtime SDK does on iOS/Android — but
// without importing the engine, transport, AppState, AsyncStorage,
// or native push module. The dashboard composer mounts these via
// react-native-web so what designers see in the live preview is the
// same component tree the SDK actually ships.
//
// Do NOT add imports from `../internal/`, `../native/`, or
// `../Ritmus.js` here — keep this surface dependency-light so it
// tree-shakes cleanly into a Next.js bundle.

export { SurveyShell, type SurveyShellProps } from './SurveyShell.js'
export { PromptShell, type PromptShellProps } from './PromptShell.js'
export { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from '../ui/theme.js'
