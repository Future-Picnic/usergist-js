import ExpoModulesCore
import UserGistFeedback
import UIKit

public class UserGistExpoAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UserGistPushImpl.shared.prepareExpoLaunch()
    return true
  }
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
      if let recipient = userInfo["usergist_anonymous_id"] as? String,
         recipient != UserGistPushState.snapshot["anonymousId"] as? String {
        completionHandler(.noData)
        return
      }
      UserGistPushState.receipt("silent-ack", id: pingId) { success in
        completionHandler(success ? .newData : .failed)
      }
      return
    }
    completionHandler(.noData)
  }
}
