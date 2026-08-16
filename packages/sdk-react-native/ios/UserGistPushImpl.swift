import Foundation
import UIKit
import UserNotifications

/// Self-contained iOS push handler for `@usergist/feedback-react-native`.
///
/// Owns:
///   1. UNUserNotificationCenter authorization + APNs registration.
///   2. Capturing the APNs device token via swizzling so consumers don't
///      have to edit `AppDelegate`.
///   3. Foreground notification banners + tap delivery via swizzled
///      `UNUserNotificationCenterDelegate`.
///   4. Forwarding every signal (`tokenReceived`, `notificationReceived`,
///      `notificationOpened`, `tokenError`) to the JS bridge.
///
/// `UserGistPushImpl` is a singleton. The Obj-C `UserGistPush` class binds an
/// `RCTEventEmitter` reference at module-init time so the Swift side can
/// emit events without owning the RN bridge type.
@objc(UserGistPushImpl)
public final class UserGistPushImpl: NSObject {

  // MARK: - Singleton

  @objc public static let shared = UserGistPushImpl()

  private weak var emitter: AnyObject?
  private var hasJsListeners: Bool = false

  /// Buffer of events that arrived before JS was ready to listen. Drained
  /// the moment `startObserving` fires.
  private var pendingEvents: [(name: String, body: [String: Any])] = []

  /// The APNs token captured during the most recent registration cycle.
  /// Cached so the JS layer can ask for it without forcing a re-prompt.
  private var lastApnsTokenHex: String?

  /// The notification (if any) the user tapped while the app was killed
  /// — surfaced via `getInitialNotification` so the host can navigate.
  private var initialNotification: [String: Any]?

  private override init() {
    super.init()
    // AppDelegate APNs swizzle is installed from Obj-C +load (see
    // UserGistPushSwizzle.m) so it's in place BEFORE any push registration
    // cycle. UNUserNotificationCenter delegate swizzle stays here since
    // it only matters once notifications start arriving.
    Self.installUNDelegateSwizzleIfNeeded()
  }

  /// Exposed to Obj-C so UserGistPushSwizzle.m's setDelegate: interceptor
  /// can fetch the shared UN delegate and reinstall it whenever some
  /// other SDK (FirebaseAnalytics, OneSignal, etc.) tries to take over.
  @objc public static func usergistUNDelegate() -> AnyObject {
    return UserGistUNDelegateSwizzler.sharedDelegateAccessor
  }

  // MARK: - Bridge wiring

  /// Called by `UserGistPush.mm -init`. Swift never imports React-Core, so we
  /// take an opaque reference and reflect back through `@objc selector`s.
  @objc public func bindEmitter(_ emitter: AnyObject) {
    self.emitter = emitter
  }

  @objc public func setHasJsListeners(_ value: Bool) {
    self.hasJsListeners = value
    if value {
      drainPendingEvents()
    }
  }

  // MARK: - Exported (called from UserGistPush.mm)

  @objc public func enablePush(options: [String: Any],
                                resolver: @escaping (Any?) -> Void,
                                rejecter: @escaping (String, String, Error?) -> Void) {
    NSLog("[UserGistPush] enablePush called")
    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound, .providesAppNotificationSettings]
    ) { [weak self] granted, error in
      NSLog("[UserGistPush] requestAuthorization callback granted=\(granted) error=\(String(describing: error))")
      if let error = error {
        rejecter("auth_error", error.localizedDescription, error)
        return
      }
      let status: String = granted ? "authorized" : "denied"
      DispatchQueue.main.async {
        if granted {
          NSLog("[UserGistPush] calling UIApplication.registerForRemoteNotifications")
          UIApplication.shared.registerForRemoteNotifications()
        }
        // Token arrives asynchronously via the swizzled
        // `application:didRegisterForRemoteNotificationsWithDeviceToken:`
        // callback. Resolve immediately with whatever we have cached so the
        // caller has a result even if the token is still in flight; the
        // `tokenReceived` event will fire shortly with the value.
        resolver([
          "granted": granted,
          "status": status,
          "token": self?.lastApnsTokenHex as Any,
          "platform": "ios"
        ])
      }
    }
  }

  @objc public func disablePush(resolver: @escaping (Any?) -> Void,
                                 rejecter: @escaping (String, String, Error?) -> Void) {
    DispatchQueue.main.async {
      UIApplication.shared.unregisterForRemoteNotifications()
      self.lastApnsTokenHex = nil
      resolver(nil)
    }
  }

  @objc public func getPermissionStatus(resolver: @escaping (Any?) -> Void,
                                         rejecter: @escaping (String, String, Error?) -> Void) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let s: String
      switch settings.authorizationStatus {
      case .authorized: s = "authorized"
      case .denied: s = "denied"
      case .notDetermined: s = "not_determined"
      case .provisional: s = "provisional"
      case .ephemeral: s = "authorized"
      @unknown default: s = "not_determined"
      }
      resolver(s)
    }
  }

  @objc public func setBadgeCount(_ count: Double,
                                   resolver: @escaping (Any?) -> Void,
                                   rejecter: @escaping (String, String, Error?) -> Void) {
    DispatchQueue.main.async {
      let center = UNUserNotificationCenter.current()
      let n = Int(count)
      if #available(iOS 16.0, *) {
        center.setBadgeCount(n) { error in
          if let error = error {
            rejecter("badge_failed", error.localizedDescription, error)
          } else {
            resolver(nil)
          }
        }
      } else {
        UIApplication.shared.applicationIconBadgeNumber = n
        resolver(nil)
      }
    }
  }

  @objc public func getInitialNotification(resolver: @escaping (Any?) -> Void,
                                            rejecter: @escaping (String, String, Error?) -> Void) {
    resolver(initialNotification as Any?)
  }

  // MARK: - Internal — emission helpers (called from swizzles)

  @objc public func recordToken(deviceToken: Data) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    NSLog("[UserGistPush] APNs token received (\(hex.count) hex chars) — emitting tokenReceived")
    lastApnsTokenHex = hex
    emit(name: "UserGistPush:tokenReceived", body: ["token": hex, "platform": "ios"])
  }

  @objc public func recordTokenError(error: Error) {
    NSLog("[UserGistPush] APNs registration FAILED: \(error.localizedDescription)")
    emit(name: "UserGistPush:tokenError",
         body: ["error": error.localizedDescription])
  }

  func recordNotificationReceived(userInfo: [AnyHashable: Any]) {
    let normalized = normalizeUserInfo(userInfo)
    emit(name: "UserGistPush:notificationReceived", body: normalized)
  }

  func recordNotificationOpened(userInfo: [AnyHashable: Any], actionIdentifier: String?) {
    var body = normalizeUserInfo(userInfo)
    if let actionIdentifier = actionIdentifier, actionIdentifier != "com.apple.UNNotificationDefaultActionIdentifier" {
      body["actionIdentifier"] = actionIdentifier
    }
    if initialNotification == nil {
      // First open captured — surface via getInitialNotification.
      initialNotification = body
    }
    emit(name: "UserGistPush:notificationOpened", body: body)
  }

  // MARK: - Internal — emit + normalize

  private func emit(name: String, body: [String: Any]) {
    guard hasJsListeners else {
      NSLog("[UserGistPush] emit BUFFER \(name) — JS not listening yet (pending=\(pendingEvents.count + 1))")
      pendingEvents.append((name, body))
      return
    }
    NSLog("[UserGistPush] emit SEND \(name)")
    sendToEmitter(name: name, body: body)
  }

  private func drainPendingEvents() {
    let buffered = pendingEvents
    pendingEvents = []
    for ev in buffered {
      sendToEmitter(name: ev.name, body: ev.body)
    }
  }

  private func sendToEmitter(name: String, body: [String: Any]) {
    guard let emitter = emitter else { return }
    // RCTEventEmitter exposes `sendEventWithName:body:`. Reflect to call
    // it without importing React-Core in Swift (keeps the Swift module
    // free of React headers, which simplifies new-arch interop).
    let sel = NSSelectorFromString("sendEventWithName:body:")
    guard emitter.responds(to: sel) else { return }
    _ = emitter.perform(sel, with: name, with: body as NSDictionary)
  }

  private func normalizeUserInfo(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
    var out: [String: Any] = [:]
    var aps: [String: Any]?
    var data: [String: Any] = [:]
    for (k, v) in userInfo {
      guard let key = k as? String else { continue }
      if key == "aps", let dict = v as? [String: Any] {
        aps = dict
      } else {
        data[key] = v
      }
    }
    if let alert = aps?["alert"] as? [String: Any] {
      if let title = alert["title"] as? String { out["title"] = title }
      if let body = alert["body"] as? String { out["body"] = body }
    } else if let alertString = aps?["alert"] as? String {
      out["body"] = alertString
    }
    out["data"] = data
    // delivery_id can land in three places depending on payload shape:
    //   1. flat   data["usergist_delivery_id"]   — FCM data-only path
    //   2. flat   data["delivery_id"]          — legacy / generic path
    //   3. nested data["usergist"]["deliveryId"] — current APNs payload
    // Without fallback (3), iOS opens land with deliveryId=nil and the
    // server-side patcher early-returns → opened_at never updates.
    let nestedUserGist = data["usergist"] as? [String: Any]
    if let deliveryId =
      (data["delivery_id"] as? String)
      ?? (data["usergist_delivery_id"] as? String)
      ?? (nestedUserGist?["deliveryId"] as? String)
    {
      out["deliveryId"] = deliveryId
    }
    if let actionId = nestedUserGist?["actionIdentifier"] as? String {
      // Carry a server-set action id through if present (none today, future-proof).
      out["actionIdentifier"] = actionId
    }
    return out
  }

  // MARK: - UN delegate swizzle install

  private static var unDelegateInstalled = false

  private static func installUNDelegateSwizzleIfNeeded() {
    guard !unDelegateInstalled else { return }
    unDelegateInstalled = true
    // Install synchronously — at +load time we're on the main thread and
    // Firebase's setDelegate call runs synchronously on main. Deferring
    // via DispatchQueue.main.async would let Firebase's call land first.
    UserGistUNDelegateSwizzler.install()
    // Re-install whenever the app foregrounds. Belt-and-braces against
    // any SDK that re-takes the delegate while the app is backgrounded.
    NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main,
    ) { _ in
      UserGistUNDelegateSwizzler.reinstallIfHijacked()
    }
  }
}

// MARK: - AppDelegate swizzler (APNs token capture)

// AppDelegate APNs swizzle has moved to UserGistPushSwizzle.m (pure Obj-C,
// installed via +load + UIApplicationDidFinishLaunchingNotification so it
// lands before any iOS push registration cycle). The Obj-C bridge calls
// `[UserGistPushImpl.shared recordTokenWithDeviceToken:]` /
// `recordTokenErrorWithError:` from the swizzled IMP.

// MARK: - UNUserNotificationCenterDelegate swizzler (foreground + open)

@objc private final class UserGistUNDelegateSwizzler: NSObject, UNUserNotificationCenterDelegate {

  fileprivate static let sharedDelegate = UserGistUNDelegateSwizzler()
  /// Public access to the shared instance for the Obj-C swizzle bridge.
  @objc fileprivate static var sharedDelegateAccessor: AnyObject { return sharedDelegate }
  private weak var existingDelegate: UNUserNotificationCenterDelegate?

  fileprivate static func install() {
    let center = UNUserNotificationCenter.current()
    if let existing = center.delegate, existing !== sharedDelegate {
      sharedDelegate.existingDelegate = existing
    }
    center.delegate = sharedDelegate
    NSLog("[UserGistPush] UN delegate installed (chained=\(sharedDelegate.existingDelegate != nil))")
  }

  /// Re-install if some other SDK has stolen the delegate since we last set it.
  /// Called on every foreground transition.
  fileprivate static func reinstallIfHijacked() {
    let center = UNUserNotificationCenter.current()
    guard center.delegate !== sharedDelegate else { return }
    NSLog("[UserGistPush] delegate hijacked by \(String(describing: type(of: center.delegate))) — reinstalling")
    if let existing = center.delegate, existing !== sharedDelegate {
      sharedDelegate.existingDelegate = existing
    }
    center.delegate = sharedDelegate
  }

  /// Resolve the foreign delegate to chain to: prefer the most recent one
  /// captured by the Obj-C setDelegate: interceptor (catches Firebase /
  /// OneSignal / etc. that install AFTER our swizzle ran), fall back to
  /// whatever was on the center when our swizzle first installed.
  private func chainTarget() -> UNUserNotificationCenterDelegate? {
    if let foreign = _UserGistGetLastForeignDelegate() as? UNUserNotificationCenterDelegate,
       foreign !== self {
      return foreign
    }
    return existingDelegate
  }

  // Foreground delivery
  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    UserGistPushImpl.shared.recordNotificationReceived(userInfo: notification.request.content.userInfo)
    if let existing = chainTarget(),
       existing.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
      existing.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
      return
    }
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound, .badge])
    } else {
      completionHandler([.alert, .sound, .badge])
    }
  }

  // Tap / action
  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              didReceive response: UNNotificationResponse,
                              withCompletionHandler completionHandler: @escaping () -> Void) {
    UserGistPushImpl.shared.recordNotificationOpened(
      userInfo: response.notification.request.content.userInfo,
      actionIdentifier: response.actionIdentifier
    )
    if let existing = chainTarget(),
       existing.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
      existing.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
      return
    }
    completionHandler()
  }
}
