package studio.usergist.feedback

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.tasks.OnCompleteListener
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Native bridge for the UserGist push pipeline on Android.
 *
 * Responsibilities:
 *   - Request POST_NOTIFICATIONS at runtime on Android 13+.
 *   - Surface the current FCM token via FirebaseMessaging.getInstance().token.
 *   - Forward token-refresh + RemoteMessage delivery to JS.  The actual
 *     RemoteMessage handling lives in UserGistFirebaseMessagingService;
 *     this module exposes only the imperative side (JS -> native calls).
 */
@Suppress("UNUSED_PARAMETER")
class UserGistPushModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener, ActivityEventListener {

  init {
    // Wire ourselves into the static event-emit helper so the Firebase
    // service can hand events back without holding a strong reference to
    // the React module.
    UserGistPushEventBus.attach(reactContext)
    reactContext.addLifecycleEventListener(this)
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  private val securePreferences by lazy {
    val masterKey = MasterKey.Builder(reactApplicationContext)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()
    EncryptedSharedPreferences.create(
      reactApplicationContext,
      "usergist_react_native_secure",
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  override fun onHostResume() {
    currentActivity?.intent?.let { consumeNotificationIntent(it) }
  }

  override fun onHostPause() = Unit
  override fun onHostDestroy() = Unit
  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) = Unit

  override fun onNewIntent(intent: Intent) {
    consumeNotificationIntent(intent)
  }

  private fun consumeNotificationIntent(intent: Intent) {
    val extras = intent.extras ?: return
    val keys = extras.keySet().filter { it.startsWith("usergist_") }
    if (keys.isEmpty()) return
    val body = Arguments.createMap()
    val data = Arguments.createMap()
    for (key in keys) {
      val value = extras.getString(key) ?: continue
      val normalized = key.removePrefix("usergist_")
      when (normalized) {
        "title" -> body.putString("title", value)
        "body" -> body.putString("body", value)
        "delivery_id" -> body.putString("deliveryId", value)
        "action_identifier" -> body.putString("actionIdentifier", value)
        else -> data.putString(key, value)
      }
      intent.removeExtra(key)
    }
    body.putMap("data", data)
    UserGistPushEventBus.emitNotificationOpened(body)
  }

  // MARK: - Exported methods

  @ReactMethod
  fun enablePush(_options: ReadableMap?, promise: Promise) {
    // Android < 13: notification permission is install-time, no runtime
    // prompt. We can short-circuit straight to the token fetch.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      val areEnabled = NotificationManagerCompat.from(reactApplicationContext).areNotificationsEnabled()
      if (!areEnabled) {
        promise.resolve(buildResult(granted = false, status = "denied", token = null))
        return
      }
      fetchTokenAndResolve(promise, status = "authorized")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      // No activity: can't ask for permission. Resolve with current state.
      val granted = ActivityCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      if (granted) {
        fetchTokenAndResolve(promise, status = "authorized")
      } else {
        promise.resolve(buildResult(granted = false, status = "not_determined", token = null))
      }
      return
    }
    val already = ActivityCompat.checkSelfPermission(
      activity,
      Manifest.permission.POST_NOTIFICATIONS
    ) == PackageManager.PERMISSION_GRANTED
    if (already) {
      fetchTokenAndResolve(promise, status = "authorized")
      return
    }
    val permAware = activity as? PermissionAwareActivity
    if (permAware == null) {
      // Fallback: classic ActivityCompat, no result callback we can hook.
      ActivityCompat.requestPermissions(
        activity,
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        REQUEST_CODE
      )
      // Without a callback we can't know the outcome — resolve as
      // not_determined so the caller can re-call after the dialog closes.
      promise.resolve(buildResult(granted = false, status = "not_determined", token = null))
      return
    }
    permAware.requestPermissions(
      arrayOf(Manifest.permission.POST_NOTIFICATIONS),
      REQUEST_CODE,
      PermissionListener { _, _, grantResults ->
        val grantedNow = grantResults.isNotEmpty() &&
          grantResults[0] == PackageManager.PERMISSION_GRANTED
        if (grantedNow) {
          fetchTokenAndResolve(promise, status = "authorized")
        } else {
          promise.resolve(buildResult(granted = false, status = "denied", token = null))
        }
        true
      }
    )
  }

  @ReactMethod
  fun disablePush(promise: Promise) {
    FirebaseMessaging.getInstance().deleteToken()
      .addOnCompleteListener { promise.resolve(null) }
  }

  @ReactMethod
  fun getPushPermissionStatus(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      val areEnabled = NotificationManagerCompat.from(reactApplicationContext).areNotificationsEnabled()
      promise.resolve(if (areEnabled) "authorized" else "denied")
      return
    }
    val granted = ActivityCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.POST_NOTIFICATIONS
    ) == PackageManager.PERMISSION_GRANTED
    promise.resolve(if (granted) "authorized" else "denied")
  }

  @ReactMethod
  fun setBadgeCount(_count: Double, promise: Promise) {
    // Android does not expose a portable badge API; some launchers honour
    // a ShortcutBadger-style broadcast but it's launcher-specific. No-op
    // for now; consumers who need it can use ShortcutBadger directly.
    promise.resolve(null)
  }

  @ReactMethod
  fun getInitialNotification(promise: Promise) {
    promise.resolve(UserGistPushEventBus.takeInitialNotification())
  }

  @ReactMethod
  fun secureGetItem(key: String, promise: Promise) {
    runCatching { securePreferences.getString(key, null) }
      .onSuccess(promise::resolve)
      .onFailure { promise.reject("secure_read_failed", it) }
  }

  @ReactMethod
  fun secureSetItem(key: String, value: String, promise: Promise) {
    runCatching {
      check(securePreferences.edit().putString(key, value).commit())
    }.onSuccess { promise.resolve(null) }
      .onFailure { promise.reject("secure_write_failed", it) }
  }

  @ReactMethod
  fun secureRemoveItem(key: String, promise: Promise) {
    runCatching { check(securePreferences.edit().remove(key).commit()) }
      .onSuccess { promise.resolve(null) }
      .onFailure { promise.reject("secure_remove_failed", it) }
  }

  @ReactMethod
  fun secureMultiRemove(keys: ReadableArray, promise: Promise) {
    runCatching {
      val edit = securePreferences.edit()
      for (index in 0 until keys.size()) {
        edit.remove(keys.getString(index))
      }
      check(edit.commit())
    }.onSuccess { promise.resolve(null) }
      .onFailure { promise.reject("secure_remove_failed", it) }
  }

  // Required for RN's NativeEventEmitter API even though we emit from a
  // separate static bus — RN will warn otherwise.
  @ReactMethod
  fun addListener(_eventName: String?) { /* no-op */ }

  @ReactMethod
  fun removeListeners(_count: Double) { /* no-op */ }

  // MARK: - Internal

  private fun fetchTokenAndResolve(promise: Promise, status: String) {
    FirebaseMessaging.getInstance().token.addOnCompleteListener(
      OnCompleteListener { task ->
        if (!task.isSuccessful) {
          val msg = task.exception?.localizedMessage ?: "fcm_token_unavailable"
          promise.resolve(buildResult(granted = true, status = status, token = null, error = msg))
          return@OnCompleteListener
        }
        val token = task.result
        // Emit on top of resolving so JS gets both the resolution AND the
        // refresh-style event (idempotent on the server side).
        UserGistPushEventBus.emitToken(token)
        promise.resolve(buildResult(granted = true, status = status, token = token))
      }
    )
  }

  private fun buildResult(
    granted: Boolean,
    status: String,
    token: String?,
    error: String? = null
  ): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("granted", granted)
    map.putString("status", status)
    map.putString("platform", "android")
    if (token != null) map.putString("token", token)
    if (error != null) map.putString("error", error)
    return map
  }

  companion object {
    const val NAME = "UserGistPush"
    private const val REQUEST_CODE = 0x52A1 // arbitrary 16-bit; "RA" in hex
  }
}

/**
 * Static bus owned by the UserGistFirebaseMessagingService; lets the service
 * forward events to JS without holding a strong reference to the
 * (possibly-not-yet-initialized) React Native bridge.
 */
internal object UserGistPushEventBus {
  @Volatile private var reactContext: ReactApplicationContext? = null
  private val pending: MutableList<Pair<String, WritableMap>> = mutableListOf()
  private var initialNotification: WritableMap? = null

  @Synchronized
  fun attach(ctx: ReactApplicationContext) {
    this.reactContext = ctx
    val drained = pending.toList()
    pending.clear()
    for ((name, body) in drained) {
      send(name, body)
    }
  }

  fun emitToken(token: String) {
    val map = Arguments.createMap()
    map.putString("token", token)
    map.putString("platform", "android")
    emit("UserGistPush:tokenReceived", map)
  }

  fun emitNotificationReceived(body: WritableMap) {
    emit("UserGistPush:notificationReceived", body)
  }

  @Synchronized
  fun emitNotificationOpened(body: WritableMap) {
    if (initialNotification == null) {
      // Snapshot so getInitialNotification() can return it once.
      initialNotification = Arguments.createMap().apply { merge(body) }
    }
    emit("UserGistPush:notificationOpened", body)
  }

  @Synchronized
  fun takeInitialNotification(): WritableMap? {
    val v = initialNotification
    initialNotification = null
    return v
  }

  @Synchronized
  private fun emit(name: String, body: WritableMap) {
    val ctx = reactContext
    if (ctx == null || !ctx.hasActiveReactInstance()) {
      if (pending.size >= 100) pending.removeAt(0)
      pending.add(name to body)
      return
    }
    send(name, body)
  }

  private fun send(name: String, body: WritableMap) {
    val ctx = reactContext ?: return
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, body)
  }
}
