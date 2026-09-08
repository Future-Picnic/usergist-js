package studio.usergist.feedback

import android.content.Context
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
  private fun receiptPrefix(state: JSONObject) = "receipt." + UUID.nameUUIDFromBytes((state.optString("writeKey") + ":" + state.optString("anonymousId")).toByteArray(Charsets.UTF_8)) + "."
  @Synchronized fun configure(context: Context, state: JSONObject) {
    check(prefs(context).edit().putString("state", state.toString()).putBoolean("push", state.optBoolean("push")).commit())
    if (state.optBoolean("push")) retry(context)
  }
  fun disable(context: Context) { prefs(context).edit().putBoolean("push", false).commit() }
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
