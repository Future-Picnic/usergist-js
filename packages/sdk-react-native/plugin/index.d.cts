export interface UserGistExpoPluginOptions {
  push?: {
    mode: 'automatic' | 'expo-notifications'
    ios?: {
      apsEnvironment: 'development' | 'production'
      appGroupIdentifier?: string
      extensionTargetName?: string
      extensionBundleIdentifier?: string
    }
    android?: { notificationIcon?: string; notificationColor?: string }
  }
}
declare const plugin: import('expo/config-plugins').ConfigPlugin<UserGistExpoPluginOptions>
export default plugin
