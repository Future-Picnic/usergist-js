import ExpoModulesCore
import UserGistFeedback
import UIKit

public class UserGistExpoAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
    UserGistPushImpl.shared.recordToken(deviceToken: token)
  }
  public func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    UserGistPushImpl.shared.recordTokenError(error: error)
  }
  public func applicationDidBecomeActive(_ application: UIApplication) {
    _ = UserGistPushState.updateBadge(count: application.applicationIconBadgeNumber)
    UserGistPushState.retry()
  }
  public func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    if userInfo["usergist_silent"] as? String == "1", let pingId = userInfo["usergist_ping_id"] as? String {
      UserGistPushState.receipt("silent-ack", id: pingId)
    }
    completionHandler(.noData)
  }
}
