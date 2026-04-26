package studio.ritmus.feedback

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
 * If the host app already declares its own FirebaseMessagingService for
 * another push provider, manifest-merger will keep both entries; the OS
 * delivers the message to the highest-priority one (typically: most
 * recently installed). Apps adopting Ritmus as their sole push provider
 * should remove their existing service declaration in their own manifest.
 */
class RitmusFirebaseMessagingService : FirebaseMessagingService() {

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    RitmusPushEventBus.emitToken(token)
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)

    val payload = normalize(remoteMessage)
    RitmusPushEventBus.emitNotificationReceived(payload)

    // Surface a system notification when the user-visible content is set.
    // Background / killed-state delivery on Android requires explicit
    // NotificationManager.notify() — RemoteMessage doesn't auto-display.
    val notification = remoteMessage.notification
    if (notification != null && (notification.title != null || notification.body != null)) {
      postSystemNotification(
        title = notification.title,
        body = notification.body,
        data = remoteMessage.data
      )
    }
  }

  private fun postSystemNotification(title: String?, body: String?, data: Map<String, String>) {
    val channelId = ensureChannel(this)
    val launchIntent = packageManager?.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      // Forward delivery_id + ritmus_delivery_id so when the user taps and
      // the app launches we can fire `$push_opened` with the right id.
      data.forEach { (k, v) -> putExtra("ritmus_$k", v) }
    }
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, pendingFlags)
    }

    val notification = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(android.R.drawable.ic_dialog_info) // host app's res icon would be ideal — kept generic to avoid res naming collisions
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()

    val nm = NotificationManagerCompat.from(this)
    val notifId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
    nm.notify(notifId, notification)
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

  private fun normalize(msg: RemoteMessage): WritableMap {
    val out = Arguments.createMap()
    msg.notification?.title?.let { out.putString("title", it) }
    msg.notification?.body?.let { out.putString("body", it) }
    val data = Arguments.createMap()
    for ((k, v) in msg.data) {
      data.putString(k, v)
    }
    out.putMap("data", data)
    val deliveryId = msg.data["delivery_id"] ?: msg.data["ritmus_delivery_id"]
    if (deliveryId != null) out.putString("deliveryId", deliveryId)
    return out
  }

  companion object {
    const val DEFAULT_CHANNEL_ID = "ritmus_default"
  }
}
