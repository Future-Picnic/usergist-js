# Preserve the manifest-instantiated FCM service and React Native module in
# minified host release builds.
-keep class studio.usergist.feedback.UserGistFirebaseMessagingService { *; }
-keep class studio.usergist.feedback.UserGistPushModule { *; }
-keep class studio.usergist.feedback.UserGistPushPackage { *; }
