import Foundation
import CryptoKit
import UserNotifications

enum UserGistNotificationActions {
  static func configure(_ content: UNMutableNotificationContent, completion: @escaping () -> Void) {
    guard let payload = content.userInfo["usergist"] as? [String: Any] else { completion(); return }
    let buttons = payload["actionButtons"] as? [[String: Any]] ?? []
    let labels = buttons.prefix(4).enumerated().compactMap { index, button -> (Int, String)? in
      guard let label = button["label"] as? String, !label.isEmpty else { return nil }
      return (index, label)
    }
    let encoded = (try? JSONSerialization.data(withJSONObject: labels.map { [$0.0, $0.1] as [Any] })) ?? Data()
    let suffix = SHA256.hash(data: encoded).map { String(format: "%02x", $0) }.joined()
    let identifier = "USERGIST_" + suffix
    let actions = labels.map { UNNotificationAction(identifier: "usergist_action_\($0.0)", title: $0.1, options: [.foreground]) }
    let category = UNNotificationCategory(identifier: identifier, actions: actions, intentIdentifiers: [], options: [.customDismissAction])
    let center = UNUserNotificationCenter.current()
    center.getNotificationCategories { categories in
      var merged = categories
      merged.insert(category)
      center.setNotificationCategories(merged)
      content.categoryIdentifier = identifier
      completion()
    }
  }
}
