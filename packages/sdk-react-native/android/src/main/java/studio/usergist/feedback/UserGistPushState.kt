package studio.usergist.feedback

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors

internal object UserGistPushState {
  private val worker = Executors.newSingleThreadExecutor()
  private fun prefs(context: Context) = context.getSharedPreferences("usergist_push_state", Context.MODE_PRIVATE)
  fun isExpo(context: Context): Boolean = metadata(context).getBoolean("UserGistExpo", false)
  fun mode(context: Context): String = metadata(context).getString("UserGistPushMode") ?: "automatic"
  private fun metadata(context: Context) = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData ?: android.os.Bundle()
  fun enabled(context: Context): Boolean = !isExpo(context) || prefs(context).getBoolean("push", false)
  fun anonymousId(context: Context): String = JSONObject(prefs(context).getString("state", "{}")!!).optString("anonymousId")
  fun accepts(context: Context, scope: String?): Boolean = enabled(context) && (scope.isNullOrEmpty() || scope == anonymousId(context))
  @Synchronized fun retainOpen(context: Context, intent: Intent): Boolean {
    val extras = intent.extras ?: return false
    val scope = extras.getString("usergist_anonymous_id")
    if (!accepts(context, scope) || !extras.containsKey("usergist_campaign_id")) return false
    val data = JSONObject()
    extras.keySet().filter { it.startsWith("usergist_") }.forEach { key ->
      extras.getString(key)?.let { data.put(key, it) }
    }
    val state = JSONObject(prefs(context).getString("state", "{}")!!)
    val record = JSONObject().put("data", data).put("at", System.currentTimeMillis())
      .put("writeKey", state.optString("writeKey"))
    return prefs(context).edit().putString("pendingOpen", record.toString()).commit()
  }
  @Synchronized fun takeOpen(context: Context): Intent? {
    val store = prefs(context)
    val raw = store.getString("pendingOpen", null) ?: return null
    if (!store.edit().remove("pendingOpen").commit()) return null
    return runCatching {
      val record = JSONObject(raw)
      val age = System.currentTimeMillis() - record.getLong("at")
      val state = JSONObject(store.getString("state", "{}")!!)
      val data = record.getJSONObject("data")
      if (age !in 0..300000 || record.optString("writeKey") != state.optString("writeKey") ||
        !accepts(context, data.optString("usergist_anonymous_id"))) return null
      Intent().apply { data.keys().forEach { key -> putExtra(key, data.getString(key)) } }
    }.getOrNull()
  }
  private fun receiptPrefix(state: JSONObject) = "receipt." + UUID.nameUUIDFromBytes((state.optString("writeKey") + ":" + state.optString("anonymousId")).toByteArray(Charsets.UTF_8)) + "."
  @Synchronized fun configure(context: Context, state: JSONObject) {
    val edit = prefs(context).edit().putString("state", state.toString()).putBoolean("push", state.optBoolean("push"))
    if (!state.optBoolean("push")) edit.remove("pendingOpen")
    check(edit.commit())
    if (state.optBoolean("push")) retry(context)
  }
  fun disable(context: Context) { prefs(context).edit().putBoolean("push", false).remove("pendingOpen").commit() }
  fun receipt(context: Context, kind: String, id: String) {
    if (id.isEmpty() || !enabled(context)) return
    val state = JSONObject(prefs(context).getString("state", "{}")!!)
    if (state.optString("writeKey").isEmpty()) return
    val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
    val body = if (kind == "silent-ack") JSONObject().put("pingId", id).put("anonymousId", state.optString("anonymousId")).put("receivedAt", now)
      else JSONObject().put("deliveryId", id).put("occurredAt", now)
    val store = prefs(context)
    val prefix = receiptPrefix(state)
    val record = JSONObject().put("state", state).put("kind", kind).put("body", body)
    val key = prefix + UUID.randomUUID()
    if (store.edit().putString(key, record.toString()).commit()) worker.execute { send(context, key, record) }
  }
  fun retry(context: Context) {
    worker.execute {
      val prefix = receiptPrefix(JSONObject(prefs(context).getString("state", "{}")!!))
      prefs(context).all.filterKeys { it.startsWith(prefix) }.entries.take(500).forEach { (key, value) ->
        runCatching { send(context, key, JSONObject(value as String)) }
      }
    }
  }
  private fun send(context: Context, key: String, record: JSONObject) {
    val store = prefs(context)
    val current = JSONObject(store.getString("state", "{}")!!)
    val state = record.getJSONObject("state")
    if (!store.getBoolean("push", false) || current.optString("anonymousId") != state.optString("anonymousId") || current.optString("writeKey") != state.optString("writeKey")) return
    var connection: HttpURLConnection? = null
    try {
      connection = URL(state.getString("apiUrl").trimEnd('/') + "/v1/sdk/push/" + record.getString("kind")).openConnection() as HttpURLConnection
      connection.connectTimeout = 5000; connection.readTimeout = 5000
      connection.instanceFollowRedirects = false
      connection.requestMethod = "POST"; connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer " + state.getString("writeKey"))
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(record.getJSONObject("body").toString().toByteArray(Charsets.UTF_8)) }
      if (connection.responseCode in 200..299) store.edit().remove(key).commit()
    } catch (_: Exception) { /* Retry after foregrounding; retain the original receipt scope. */ }
    finally { connection?.disconnect() }
  }
}
