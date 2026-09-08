import Foundation
import CryptoKit
import Darwin

/// Shared by the app and NSE. Each receipt has its own atomic file, avoiding
/// read/modify/write races between the two processes. No subject credentials.
public enum UserGistPushState {
  private static var group: String? { Bundle.main.object(forInfoDictionaryKey: "UserGistAppGroup") as? String }
  private static var root: URL? {
    guard let group = group else { return nil }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("usergist", isDirectory: true)
  }
  private static var stateURL: URL? { root?.appendingPathComponent("state.json") }
  public static var snapshot: [String: Any] {
    guard let url = stateURL, let data = try? Data(contentsOf: url),
          let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return state
  }
  public static var enabled: Bool { snapshot["push"] as? Bool == true }
  public static func updateBadge(count: Int? = nil, increment: Bool = false) -> NSNumber? {
    guard let root = root else { return count.map { NSNumber(value: max(0, $0)) } }
    do { try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true) } catch { return nil }
    let descriptor = Darwin.open(root.appendingPathComponent("badge.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { return nil }
    defer { Darwin.close(descriptor) }
    guard flock(descriptor, LOCK_EX) == 0 else { return nil }
    defer { flock(descriptor, LOCK_UN) }
    let file = root.appendingPathComponent("badge.json")
    let previous = (try? String(contentsOf: file, encoding: .utf8)).flatMap(Int.init) ?? 0
    let next = max(0, count ?? (increment ? min(previous, Int.max - 1) + 1 : previous))
    do { try Data(String(next).utf8).write(to: file, options: .atomic); return NSNumber(value: next) }
    catch { return nil }
  }
  private static func receiptsFolder(_ state: [String: Any]) -> URL? {
    let scope = "\(state["writeKey"] as? String ?? ""):\(state["anonymousId"] as? String ?? "")"
    let hash = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
    return root?.appendingPathComponent("receipts", isDirectory: true).appendingPathComponent(hash, isDirectory: true)
  }

  public static func configure(_ state: [String: Any]) throws {
    guard let root = root, let url = stateURL else { return }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try JSONSerialization.data(withJSONObject: state).write(to: url, options: .atomic)
    if state["push"] as? Bool == true { retry() }
  }
  public static func disable() {
    var state = snapshot
    state["push"] = false
    try? configure(state)
  }

  public static func receipt(_ kind: String, id: String, completion: @escaping (Bool) -> Void = { _ in }) {
    let state = snapshot
    guard state["push"] as? Bool == true, !id.isEmpty, let folder = receiptsFolder(state),
          let key = state["writeKey"] as? String,
          let api = state["apiUrl"] as? String,
          let anonymousId = state["anonymousId"] as? String else { completion(false); return }
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let now = ISO8601DateFormatter().string(from: Date())
      let body: [String: Any] = kind == "silent-ack"
        ? ["pingId": id, "anonymousId": anonymousId, "receivedAt": now]
        : ["deliveryId": id, "occurredAt": now]
      let record: [String: Any] = ["kind": kind, "body": body, "writeKey": key, "apiUrl": api, "anonymousId": anonymousId]
      let file = folder.appendingPathComponent(UUID().uuidString + ".json")
      try JSONSerialization.data(withJSONObject: record).write(to: file, options: .atomic)
      send(file, completion: completion)
    } catch { completion(false) }
  }
  public static func retry() {
    guard let folder = receiptsFolder(snapshot),
          let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return }
    files.prefix(500).forEach { send($0) }
  }
  private static func send(_ file: URL, completion: @escaping (Bool) -> Void = { _ in }) {
    guard let data = try? Data(contentsOf: file),
          let record = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let key = record["writeKey"] as? String, let api = record["apiUrl"] as? String,
          let kind = record["kind"] as? String, let body = record["body"] as? [String: Any],
          let base = URL(string: api), ["https", "http"].contains(base.scheme ?? "") else { completion(false); return }
    let state = snapshot
    // Never replay old identity receipts with a new session's configuration.
    guard state["push"] as? Bool == true, state["writeKey"] as? String == key,
          state["anonymousId"] as? String == record["anonymousId"] as? String else { completion(false); return }
    var request = URLRequest(url: base.appendingPathComponent("v1/sdk/push/" + kind), timeoutInterval: 5)
    request.httpMethod = "POST"
    request.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    let lock = NSLock()
    var completed = false
    let finish: (Bool) -> Void = { success in
      lock.lock()
      guard !completed else { lock.unlock(); return }
      completed = true
      lock.unlock()
      completion(success)
    }
    URLSession.shared.dataTask(with: request) { _, response, error in
      let success = error == nil && (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0)
      if success {
        try? FileManager.default.removeItem(at: file)
      }
      finish(success)
    }.resume()
    // Keep the extension/background task alive for the acknowledgement attempt,
    // while retaining a bounded completion even if the connection stalls.
    DispatchQueue.global().asyncAfter(deadline: .now() + 5.5) { finish(false) }
  }
}
