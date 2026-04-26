import Foundation
import UIKit
import UserNotifications

/// Self-contained iOS push handler for `@ritmus/feedback-react-native`.
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
/// `RitmusPushImpl` is a singleton. The Obj-C `RitmusPush` class binds an
/// `RCTEventEmitter` reference at module-init time so the Swift side can
/// emit events without owning the RN bridge type.
@objc(RitmusPushImpl)
public final class RitmusPushImpl: NSObject {

  // MARK: - Singleton

  @objc public static let shared = RitmusPushImpl()

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
    // RitmusPushSwizzle.m) so it's in place BEFORE any push registration
    // cycle. UNUserNotificationCenter delegate swizzle stays here since
    // it only matters once notifications start arriving.
    Self.installUNDelegateSwizzleIfNeeded()
  }

  // MARK: - Bridge wiring

  /// Called by `RitmusPush.mm -init`. Swift never imports React-Core, so we
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

  // MARK: - Exported (called from RitmusPush.mm)

  @objc public func enablePush(options: [String: Any],
                                resolver: @escaping (Any?) -> Void,
                                rejecter: @escaping (String, String, Error?) -> Void) {
    NSLog("[RitmusPush] enablePush called")
    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound, .providesAppNotificationSettings]
    ) { [weak self] granted, error in
      NSLog("[RitmusPush] requestAuthorization callback granted=\(granted) error=\(String(describing: error))")
      if let error = error {
        rejecter("auth_error", error.localizedDescription, error)
        return
      }
      let status: String = granted ? "authorized" : "denied"
      DispatchQueue.main.async {
        if granted {
          NSLog("[RitmusPush] calling UIApplication.registerForRemoteNotifications")
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
    NSLog("[RitmusPush] APNs token received (\(hex.count) hex chars) — emitting tokenReceived")
    lastApnsTokenHex = hex
    emit(name: "RitmusPush:tokenReceived", body: ["token": hex, "platform": "ios"])
  }

  @objc public func recordTokenError(error: Error) {
    NSLog("[RitmusPush] APNs registration FAILED: \(error.localizedDescription)")
    emit(name: "RitmusPush:tokenError",
         body: ["error": error.localizedDescription])
  }

  func recordNotificationReceived(userInfo: [AnyHashable: Any]) {
    let normalized = normalizeUserInfo(userInfo)
    emit(name: "RitmusPush:notificationReceived", body: normalized)
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
    emit(name: "RitmusPush:notificationOpened", body: body)
  }

  // MARK: - Internal — emit + normalize

  private func emit(name: String, body: [String: Any]) {
    guard hasJsListeners else {
      NSLog("[RitmusPush] emit BUFFER \(name) — JS not listening yet (pending=\(pendingEvents.count + 1))")
      pendingEvents.append((name, body))
      return
    }
    NSLog("[RitmusPush] emit SEND \(name)")
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
    if let deliveryId = data["delivery_id"] as? String ?? data["ritmus_delivery_id"] as? String {
      out["deliveryId"] = deliveryId
    }
    return out
  }

  // MARK: - UN delegate swizzle install

  private static var unDelegateInstalled = false

  private static func installUNDelegateSwizzleIfNeeded() {
    guard !unDelegateInstalled else { return }
    unDelegateInstalled = true
    DispatchQueue.main.async {
      RitmusUNDelegateSwizzler.install()
    }
  }
}

// MARK: - AppDelegate swizzler (APNs token capture)

// AppDelegate APNs swizzle has moved to RitmusPushSwizzle.m (pure Obj-C,
// installed via +load + UIApplicationDidFinishLaunchingNotification so it
// lands before any iOS push registration cycle). The Obj-C bridge calls
// `[RitmusPushImpl.shared recordTokenWithDeviceToken:]` /
// `recordTokenErrorWithError:` from the swizzled IMP.

// MARK: - UNUserNotificationCenterDelegate swizzler (foreground + open)

@objc private final class RitmusUNDelegateSwizzler: NSObject, UNUserNotificationCenterDelegate {

  private static let sharedDelegate = RitmusUNDelegateSwizzler()
  private weak var existingDelegate: UNUserNotificationCenterDelegate?

  fileprivate static func install() {
    let center = UNUserNotificationCenter.current()
    if let existing = center.delegate, existing !== sharedDelegate {
      sharedDelegate.existingDelegate = existing
    }
    center.delegate = sharedDelegate
  }

  // Foreground delivery
  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    RitmusPushImpl.shared.recordNotificationReceived(userInfo: notification.request.content.userInfo)
    if let existing = existingDelegate,
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
    RitmusPushImpl.shared.recordNotificationOpened(
      userInfo: response.notification.request.content.userInfo,
      actionIdentifier: response.actionIdentifier
    )
    if let existing = existingDelegate,
       existing.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
      existing.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
      return
    }
    completionHandler()
  }
}
