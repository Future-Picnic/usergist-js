import type {ArmedInAppMessage} from '@usergist/sdk-core/mobile'
export function inAppScreenAllowed(message: Pick<ArmedInAppMessage, 'screenAllowlist'|'screenDenylist'>, screenName?: string): boolean {
 const screen=screenName??''
 return (!message.screenAllowlist?.length||message.screenAllowlist.includes(screen))&&!message.screenDenylist?.includes(screen)
}
