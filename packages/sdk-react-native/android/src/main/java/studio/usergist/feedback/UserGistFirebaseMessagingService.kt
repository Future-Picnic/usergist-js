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

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    UserGistPushEventBus.emitToken(token)
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)

    val payload = normalize(remoteMessage)
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
        data = remoteMessage.data
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
      PendingIntent.getActivity(this, 0, it, pendingFlags)
    }

    val notifId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
    val builder = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)

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

    val nm = NotificationManagerCompat.from(this)
    nm.notify(notifId, builder.build())
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

  private fun normalize(msg: RemoteMessage): WritableMap {
    val out = Arguments.createMap()
    msg.notification?.title?.let { out.putString("title", it) }
    msg.notification?.body?.let { out.putString("body", it) }
    val data = Arguments.createMap()
    for ((k, v) in msg.data) {
      data.putString(k, v)
    }
    out.putMap("data", data)
    val deliveryId = msg.data["delivery_id"] ?: msg.data["usergist_delivery_id"]
    if (deliveryId != null) out.putString("deliveryId", deliveryId)
    return out
  }

  companion object {
    const val DEFAULT_CHANNEL_ID = "usergist_default"
  }
}
