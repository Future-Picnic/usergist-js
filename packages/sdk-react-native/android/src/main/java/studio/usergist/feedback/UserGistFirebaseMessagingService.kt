package studio.usergist.feedback

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONArray

/**
 * Library-supplied FirebaseMessagingService.  Auto-registered via the
 * library AndroidManifest's manifest-merger entry — consumer apps don't
 * write any Firebase code.
 *
 *  - `onNewToken`        : forward to JS so the SDK re-registers with the API.
 *  - `onMessageReceived` : (a) emit a `notificationReceived` JS event so
 *                         the host can react, (b) post a system notification
 *                         when the host app is backgrounded so the user sees
 *                         the message even when no Activity is alive.
 *
 * If the host app already declares its own FirebaseMessagingService, it must
 * disable this service with the `userGistFirebaseServiceEnabled` manifest
 * placeholder and forward tokens/messages through the public Push API.
 */
class UserGistFirebaseMessagingService : FirebaseMessagingService() {

  override fun onNewToken(token: String) = handleToken(token)
  override fun onMessageReceived(message: RemoteMessage) = handleMessage(this, message)
  companion object {
    @JvmStatic fun handleToken(token: String) = UserGistPushEventBus.emitToken(token)
    @JvmStatic fun handleMessage(context: Context, message: RemoteMessage) {
      if (!UserGistPushState.enabled(context)) return
      // FCM already invokes this on its worker thread. Keep the service alive
      // until presentation completes instead of leaving detached work behind.
      UserGistMessageHandler(context.applicationContext).receive(message)
    }
  }
}

private class UserGistMessageHandler(context: Context) : android.content.ContextWrapper(context) {
  fun receive(remoteMessage: RemoteMessage) {
    val recipient = remoteMessage.data["usergist_anonymous_id"] ?: UserGistPushState.anonymousId(this)
    if (!UserGistPushState.accepts(this, recipient)) return
    if (remoteMessage.data["usergist_silent"] == "1") {
      UserGistPushState.receipt(this, "silent-ack", remoteMessage.data["usergist_ping_id"] ?: "")
      return
    }
    if (!remoteMessage.data.containsKey("usergist_campaign_id")) return
    UserGistPushState.receipt(this, "delivered", remoteMessage.data["usergist_delivery_id"] ?: "")
    val payload = normalize(remoteMessage, recipient)
    UserGistPushEventBus.emitNotificationReceived(payload)

    // Surface a system notification when the user-visible content is set.
    // Background / killed-state delivery on Android requires explicit
    // NotificationManager.notify() — RemoteMessage doesn't auto-display.
    val notification = remoteMessage.notification
    val title = notification?.title ?: remoteMessage.data["title"] ?: remoteMessage.data["usergist_title"]
    val body = notification?.body ?: remoteMessage.data["body"] ?: remoteMessage.data["usergist_body"]
    if (title != null || body != null) {
      postSystemNotification(
        title = title,
        body = body,
        data = remoteMessage.data + ("usergist_anonymous_id" to recipient)
      )
    }
  }

  private fun postSystemNotification(title: String?, body: String?, data: Map<String, String>) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
    ) return
    val channelId = resolveChannel(this, data["usergist_channel_id"] ?: data["channel_id"])
    val launchIntent = packageManager?.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      // Forward delivery_id + usergist_delivery_id so when the user taps and
      // the app launches we can fire `$push_opened` with the right id.
      data.forEach { (k, v) ->
        val key = if (k.startsWith("usergist_")) k else "usergist_$k"
        putExtra(key, v)
      }
    }
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(this, (data["usergist_delivery_id"] ?: data.toString()).hashCode(), it, pendingFlags)
    }

    val notifId = (data["usergist_delivery_id"] ?: data.toString()).hashCode()
    val builder = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(packageManager.getApplicationInfo(packageName, android.content.pm.PackageManager.GET_META_DATA).metaData?.getInt("UserGistNotificationIcon", 0)?.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
    data["usergist_badge"]?.let { raw ->
      val badges = getSharedPreferences("usergist_push_badges", Context.MODE_PRIVATE)
      val count = if (raw == "+1") badges.getInt("count", 0) + 1 else raw.toIntOrNull()
      if (count != null && count >= 0) { builder.setNumber(count); badges.edit().putInt("count", count).apply() }
    }

    val rawActions = data["usergist_actions"]
    if (!rawActions.isNullOrBlank() && launchIntent != null) {
      runCatching {
        val actions = JSONArray(rawActions)
        for (index in 0 until actions.length()) {
          val action = actions.optJSONObject(index) ?: continue
          val label = action.optString("label").takeIf { it.isNotBlank() } ?: continue
          val actionIntent = Intent(launchIntent).apply {
            putExtra("usergist_action_identifier", "usergist_action_$index")
          }
          val actionPendingIntent = PendingIntent.getActivity(
            this,
            notifId * 10 + index + 1,
            actionIntent,
            pendingFlags,
          )
          builder.addAction(0, label, actionPendingIntent)
        }
      }
    }

    val color = packageManager.getApplicationInfo(packageName, android.content.pm.PackageManager.GET_META_DATA).metaData?.get("UserGistNotificationColor")
    when (color) {
      is Int -> builder.setColor(color)
      is String -> runCatching { builder.setColor(android.graphics.Color.parseColor(color)) }
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O && data["usergist_sound"] != "none") {
      val sound = data["usergist_sound"]
      val custom = sound?.takeIf { it != "default" }?.let { resources.getIdentifier(it.substringBeforeLast('.'), "raw", packageName) } ?: 0
      builder.setSound(if (custom != 0) android.net.Uri.parse("android.resource://$packageName/$custom") else android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION))
    }
    data["usergist_image_url"]?.let { raw ->
      var connection: java.net.HttpURLConnection? = null
      try {
        val url = java.net.URL(raw)
        if (url.protocol == "https") {
          connection = url.openConnection() as java.net.HttpURLConnection
          connection.connectTimeout = 4000; connection.readTimeout = 4000
          connection.instanceFollowRedirects = false
          if (connection.responseCode in 200..299) {
            val bytes = connection.inputStream.use { stream ->
              val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
              while (out.size() <= 5 * 1024 * 1024) { val count = stream.read(buffer); if (count < 0) break; out.write(buffer, 0, count) }
              out.toByteArray()
            }
            if (bytes.size <= 5 * 1024 * 1024) {
              val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
              android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
              val decode = android.graphics.BitmapFactory.Options().apply { inSampleSize = (maxOf(bounds.outWidth, bounds.outHeight) / 1024).coerceAtLeast(1) }
              android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decode)?.let { builder.setStyle(NotificationCompat.BigPictureStyle().bigPicture(it)) }
            }
          }
        }
      } catch (_: Exception) { /* Text notification still displays. */ }
      finally { connection?.disconnect() }
    }
    val dismiss = Intent(this, UserGistNotificationDismissReceiver::class.java).apply {
      data.forEach { (k, v) -> putExtra(k, v) }
    }
    builder.setDeleteIntent(PendingIntent.getBroadcast(this, notifId, dismiss, pendingFlags))
    val nm = NotificationManagerCompat.from(this)
    if (!UserGistPushState.accepts(this, data["usergist_anonymous_id"]) || !nm.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channelId)?.importance == NotificationManager.IMPORTANCE_NONE) return
    nm.notify(notifId, builder.build())
    UserGistPushState.receipt(this, "displayed", data["usergist_delivery_id"] ?: "")
    val displayed = Arguments.createMap()
    displayed.putMap("data", Arguments.createMap().apply { data.forEach { (k, v) -> putString(k, v) } })
    UserGistPushEventBus.emitNotificationDisplayed(displayed)
  }

  private fun ensureChannel(ctx: Context): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return DEFAULT_CHANNEL_ID
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(DEFAULT_CHANNEL_ID) == null) {
      val channel = NotificationChannel(
        DEFAULT_CHANNEL_ID,
        "Notifications",
        NotificationManager.IMPORTANCE_DEFAULT
      )
      nm.createNotificationChannel(channel)
    }
    return DEFAULT_CHANNEL_ID
  }

  private fun resolveChannel(ctx: Context, requested: String?): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || requested.isNullOrBlank()) {
      return ensureChannel(ctx)
    }
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return if (nm.getNotificationChannel(requested) != null) requested else ensureChannel(ctx)
  }

  private fun normalize(msg: RemoteMessage, recipient: String): WritableMap {
    val out = Arguments.createMap()
    msg.notification?.title?.let { out.putString("title", it) }
    msg.notification?.body?.let { out.putString("body", it) }
    val data = Arguments.createMap()
    for ((k, v) in msg.data) {
      data.putString(k, v)
    }
    data.putString("usergist_anonymous_id", recipient)
    out.putMap("data", data)
    val deliveryId = msg.data["delivery_id"] ?: msg.data["usergist_delivery_id"]
    if (deliveryId != null) out.putString("deliveryId", deliveryId)
    return out
  }

  companion object {
    const val DEFAULT_CHANNEL_ID = "usergist_default"
  }
}
