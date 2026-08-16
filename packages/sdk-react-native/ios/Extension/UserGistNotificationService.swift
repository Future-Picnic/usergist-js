import Foundation
import UserNotifications

/// Drop-in base class for the consumer's iOS Notification Service Extension.
///
/// **Why an NSE is needed:** for media-rich pushes (image attachments,
/// rendered locally), sub-titled grouping, or custom content modification,
/// iOS requires a separate Xcode target whose `NotificationService` runs
/// in-process when each push arrives, BEFORE the system displays it.
/// The host app's main bundle cannot do this work — only the extension can.
/// (See: Apple "Modifying Content in Newly Delivered Notifications".)
///
/// **How to install:**
///   1. Xcode → File → New → Target → Notification Service Extension.
///   2. Set the Bundle Identifier to `<your-main-bundle>.UserGistNotificationServiceExtension`.
///   3. **Replace** the auto-generated `NotificationService.swift` with:
///
///        ```swift
///        import UserNotifications
///        import UserGistFeedback
///
///        class NotificationService: UserGistNotificationService { }
///        ```
///
///   4. Add `UserGistFeedback` to the extension target's Linked Frameworks
///      (it's the same pod the main app already uses; CocoaPods picks it
///      up via the extension's target stanza in your `Podfile`).
///
/// **Configuration (Info.plist of the NSE target, or shared App Group):**
///   • `UserGistWriteKey`       — required; write key the main SDK uses.
///   • `UserGistApiUrl`         — optional; defaults to https://api.usergist.studio.
///   • `UserGistAppGroup`       — optional; App Group id shared with main app.
///   • `UserGistAnonymousId`    — optional; written by main SDK at init for
///                              silent-ack scoping.
///
/// **What this base class does on each received push:**
///   1. Detects silent reachability pings (`usergist_silent: "1"`) and acks
///      directly to /v1/sdk/push/silent-ack — never shows anything.
///   2. For real notifications, fires `POST /v1/sdk/push/delivered` to
///      record true delivered_at (separate from opened_at).
///   3. As a network-fail fallback, writes the delivery_id to a shared
///      App Group ledger; the main app drains it on next foreground.
///   4. Honours an optional `subtitle` field.
///   5. Downloads any image attachment from `extra.imageUrl` (UserGist
///      convention) or `fcm_options.image` (FCM convention) and attaches
///      it to the notification.
open class UserGistNotificationService: UNNotificationServiceExtension {

  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  open override func didReceive(_ request: UNNotificationRequest,
                                  withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    self.contentHandler = contentHandler
    self.bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

    let userInfo = request.content.userInfo

    // ---------- Silent reachability ping ----------
    if (userInfo["usergist_silent"] as? String) == "1" {
      let pingId = (userInfo["usergist_ping_id"] as? String) ?? ""
      UserGistBeaconClient.silentAck(pingId: pingId) {
        // Empty content — no banner, no sound, no badge.
        contentHandler(UNNotificationContent())
      }
      return
    }

    guard let bestAttempt = self.bestAttempt else {
      contentHandler(request.content)
      return
    }

    // ---------- Delivered beacon (direct, with App Group fallback) ----------
    if let deliveryId = extractDeliveryId(from: userInfo) {
      UserGistBeaconClient.delivered(deliveryId: deliveryId)
      UserGistDeliveryLedger.recordDelivered(deliveryId: deliveryId)
    }

    if let subtitle = userInfo["subtitle"] as? String {
      bestAttempt.subtitle = subtitle
    }

    // ---------- Rich-media attachment ----------
    let imageUrlString = extractImageUrl(from: userInfo)

    guard let raw = imageUrlString, let imageUrl = URL(string: raw) else {
      contentHandler(bestAttempt)
      return
    }

    downloadAttachment(from: imageUrl) { attachment in
      if let attachment = attachment {
        bestAttempt.attachments = [attachment]
      }
      contentHandler(bestAttempt)
    }
  }

  open override func serviceExtensionTimeWillExpire() {
    // Best effort: deliver whatever we have if Apple cuts us off (~30s).
    if let bestAttempt = self.bestAttempt, let contentHandler = self.contentHandler {
      contentHandler(bestAttempt)
    }
  }

  // MARK: - Helpers

  private func extractDeliveryId(from userInfo: [AnyHashable: Any]) -> String? {
    if let usergist = userInfo["usergist"] as? [String: Any],
       let id = usergist["deliveryId"] as? String {
      return id
    }
    return (userInfo["delivery_id"] as? String)
        ?? (userInfo["usergist_delivery_id"] as? String)
  }

  private func extractImageUrl(from userInfo: [AnyHashable: Any]) -> String? {
    if let usergist = userInfo["usergist"] as? [String: Any],
       let extra = usergist["extra"] as? [String: Any],
       let url = extra["imageUrl"] as? String {
      return url
    }
    if let direct = userInfo["image_url"] as? String { return direct }
    if let fcm = userInfo["fcm_options"] as? [String: Any],
       let image = fcm["image"] as? String {
      return image
    }
    return nil
  }

  private func downloadAttachment(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
    let task = URLSession.shared.downloadTask(with: url) { tempLocation, response, _ in
      guard let tempLocation = tempLocation else {
        completion(nil)
        return
      }
      let suggested = response?.suggestedFilename ?? url.lastPathComponent
      let dest = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent(UUID().uuidString)
        .appendingPathComponent(suggested)
      do {
        try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: tempLocation, to: dest)
        let attachment = try UNNotificationAttachment(identifier: "usergist-image", url: dest, options: nil)
        completion(attachment)
      } catch {
        completion(nil)
      }
    }
    task.resume()
  }
}

/// Network beacon client used by the NSE. NSEs *can* make network calls
/// reliably — Apple just gives us a tight 30s budget. We use 5s timeouts
/// + URLSession's background-friendly default config.
enum UserGistBeaconClient {

  static func delivered(deliveryId: String) {
    guard !deliveryId.isEmpty else { return }
    guard let writeKey = UserGistNSEConfig.writeKey,
          let apiUrl = UserGistNSEConfig.apiUrl else { return }

    let url = apiUrl.appendingPathComponent("v1/sdk/push/delivered")
    var req = URLRequest(url: url, timeoutInterval: 5)
    req.httpMethod = "POST"
    req.setValue("Bearer \(writeKey)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let body: [String: Any] = [
      "deliveryId": deliveryId,
      "occurredAt": ISO8601DateFormatter().string(from: Date()),
    ]
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: req).resume()
  }

  static func silentAck(pingId: String, completion: @escaping () -> Void) {
    guard !pingId.isEmpty else { return completion() }
    guard let writeKey = UserGistNSEConfig.writeKey,
          let apiUrl = UserGistNSEConfig.apiUrl,
          let anonymousId = UserGistNSEConfig.anonymousId else { return completion() }

    let url = apiUrl.appendingPathComponent("v1/sdk/push/silent-ack")
    var req = URLRequest(url: url, timeoutInterval: 5)
    req.httpMethod = "POST"
    req.setValue("Bearer \(writeKey)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let body: [String: Any] = [
      "pingId": pingId,
      "anonymousId": anonymousId,
      "receivedAt": ISO8601DateFormatter().string(from: Date()),
    ]
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    let task = URLSession.shared.dataTask(with: req) { _, _, _ in
      completion()
    }
    task.resume()
    // Safety net so we still call contentHandler if the request hangs.
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { completion() }
  }
}

/// Configuration plumbing. Reads from the App Group's UserDefaults first
/// (so the main SDK can rotate values without requiring an extension
/// rebuild) then falls back to the extension target's Info.plist.
enum UserGistNSEConfig {

  static var writeKey: String? { return readString(key: "UserGistWriteKey") }
  static var anonymousId: String? { return readString(key: "UserGistAnonymousId") }
  static var apiUrl: URL? {
    let raw = readString(key: "UserGistApiUrl") ?? "https://api.usergist.studio"
    return URL(string: raw)
  }

  private static func readString(key: String) -> String? {
    if let group = Bundle.main.object(forInfoDictionaryKey: "UserGistAppGroup") as? String,
       let defaults = UserDefaults(suiteName: group),
       let value = defaults.string(forKey: key),
       !value.isEmpty {
      return value
    }
    if let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
       !value.isEmpty {
      return value
    }
    return nil
  }
}

/// Tiny App Group ledger used by the NSE as a fallback when the direct
/// beacon couldn't fire (network down at receive time). The main app
/// drains it on next launch and re-fires the beacons.
public enum UserGistDeliveryLedger {

  /// Override at runtime if the consumer's App Group identifier differs.
  /// Default: read from `UserGistAppGroup` in the main bundle's Info.plist.
  public static var appGroupIdentifier: String? = nil

  private static var defaults: UserDefaults? {
    let id = appGroupIdentifier
      ?? Bundle.main.object(forInfoDictionaryKey: "UserGistAppGroup") as? String
    guard let id = id else { return nil }
    return UserDefaults(suiteName: id)
  }

  static func recordDelivered(deliveryId: String) {
    guard let defaults = defaults else { return }
    var pending = defaults.array(forKey: "usergist_pending_delivered") as? [String] ?? []
    if !pending.contains(deliveryId) {
      pending.append(deliveryId)
      defaults.set(pending, forKey: "usergist_pending_delivered")
    }
  }

  /// Called from the main app to drain + clear the ledger. Returns the IDs
  /// the NSE recorded since the last drain.
  public static func drainPendingDelivered() -> [String] {
    guard let defaults = defaults else { return [] }
    let ids = defaults.array(forKey: "usergist_pending_delivered") as? [String] ?? []
    defaults.removeObject(forKey: "usergist_pending_delivered")
    return ids
  }
}
