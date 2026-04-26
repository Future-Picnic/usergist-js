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
///   2. Set the Bundle Identifier to `<your-main-bundle>.RitmusNotificationServiceExtension`.
///   3. **Replace** the auto-generated `NotificationService.swift` with:
///
///        ```swift
///        import UserNotifications
///        import RitmusFeedback
///
///        class NotificationService: RitmusNotificationService { }
///        ```
///
///   4. Add `RitmusFeedback` to the extension target's Linked Frameworks
///      (it's the same pod the main app already uses; CocoaPods picks it
///      up via the extension's target stanza in your `Podfile`).
///
/// **What this base class does:**
///   - Downloads a remote image from `aps.mutable-content` payloads — the
///     server includes `image_url` (Ritmus convention) or `fcm_options.image`
///     (FCM convention) — and attaches it to the notification.
///   - Honours an optional `subtitle` field.
///   - Marks the delivery as received by writing the `delivery_id` to a
///     shared App Group so the main app can fire `$push_delivered` on next
///     launch (NSEs cannot make their own network calls reliably; the main
///     app does the actual reporting). To enable this, set both targets'
///     "App Groups" capability to `group.<your-bundle>.ritmus`.
open class RitmusNotificationService: UNNotificationServiceExtension {

  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  open override func didReceive(_ request: UNNotificationRequest,
                                  withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    self.contentHandler = contentHandler
    self.bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

    guard let bestAttempt = self.bestAttempt else {
      contentHandler(request.content)
      return
    }

    // Record the delivery_id into the App Group so the main app can fire
    // $push_delivered on next foreground. App-group key matches what the
    // main `Ritmus.handlePushDelivered()` reads.
    if let deliveryId = (request.content.userInfo["delivery_id"] as? String)
        ?? (request.content.userInfo["ritmus_delivery_id"] as? String) {
      RitmusDeliveryLedger.recordDelivered(deliveryId: deliveryId)
    }

    if let subtitle = request.content.userInfo["subtitle"] as? String {
      bestAttempt.subtitle = subtitle
    }

    let imageUrlString =
      (request.content.userInfo["image_url"] as? String)
      ?? ((request.content.userInfo["fcm_options"] as? [String: Any])?["image"] as? String)

    guard let imageUrlString = imageUrlString,
          let imageUrl = URL(string: imageUrlString) else {
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

  // MARK: - Attachment download

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
        let attachment = try UNNotificationAttachment(identifier: "ritmus-image", url: dest, options: nil)
        completion(attachment)
      } catch {
        completion(nil)
      }
    }
    task.resume()
  }
}

/// Tiny App Group ledger used by the NSE to record delivered IDs that the
/// main app reads on next launch. Falls back to a no-op when the consumer
/// hasn't configured an App Group — log-only side effects.
public enum RitmusDeliveryLedger {

  /// Override at runtime if the consumer's App Group identifier differs.
  /// Default: `group.<main-bundle-identifier>.ritmus`.
  public static var appGroupIdentifier: String? = nil

  private static var defaults: UserDefaults? {
    let id = appGroupIdentifier
      ?? Bundle.main.object(forInfoDictionaryKey: "RitmusAppGroup") as? String
    guard let id = id else { return nil }
    return UserDefaults(suiteName: id)
  }

  static func recordDelivered(deliveryId: String) {
    guard let defaults = defaults else { return }
    var pending = defaults.array(forKey: "ritmus_pending_delivered") as? [String] ?? []
    if !pending.contains(deliveryId) {
      pending.append(deliveryId)
      defaults.set(pending, forKey: "ritmus_pending_delivered")
    }
  }

  /// Called from the main app to drain + clear the ledger. Returns the IDs
  /// the NSE recorded since the last drain.
  public static func drainPendingDelivered() -> [String] {
    guard let defaults = defaults else { return [] }
    let ids = defaults.array(forKey: "ritmus_pending_delivered") as? [String] ?? []
    defaults.removeObject(forKey: "ritmus_pending_delivered")
    return ids
  }
}
