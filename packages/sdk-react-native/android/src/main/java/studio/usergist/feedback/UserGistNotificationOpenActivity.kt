package studio.usergist.feedback

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** Retain a system notification tap before the host's React runtime starts. */
class UserGistNotificationOpenActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      if (!UserGistPushState.retainOpen(this, intent)) return
      packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        // Existing hosts still receive the ordinary Activity intent. The
        // retained copy also covers a new intent arriving before React exists.
        intent.extras?.let { launch.putExtras(it) }
        startActivity(launch)
      }
    } finally {
      finish()
    }
  }
}
