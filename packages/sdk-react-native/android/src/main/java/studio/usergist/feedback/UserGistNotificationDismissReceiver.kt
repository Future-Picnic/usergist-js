package studio.usergist.feedback

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class UserGistNotificationDismissReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!UserGistPushState.accepts(context, intent.getStringExtra("usergist_anonymous_id"))) return
    UserGistPushState.receipt(context, "dismissed", intent.getStringExtra("usergist_delivery_id") ?: "")
    val body = com.facebook.react.bridge.Arguments.createMap()
    body.putMap("data", com.facebook.react.bridge.Arguments.createMap().apply {
      intent.extras?.keySet()?.forEach { key -> intent.getStringExtra(key)?.let { putString(key, it) } }
    })
    UserGistPushEventBus.emitNotificationDismissed(body)
  }
}
