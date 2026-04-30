#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <Foundation/Foundation.h>

// Public Objective-C bridge. The actual implementation lives in
// RitmusPushImpl.swift; this class is a thin shim that React Native's
// runtime can instantiate (RN's auto-discovery requires an Obj-C class
// or a TurboModule registration).
@interface RitmusPush : RCTEventEmitter <RCTBridgeModule>
@end

// Exposed by RitmusPushSwizzle.m. Returns whoever last tried to install
// themselves as the UNUserNotificationCenter delegate (FirebaseAnalytics,
// OneSignal, etc.). The Swift delegate uses this to chain didReceive /
// willPresent so other SDKs' analytics still fire while we keep ownership.
NSObject * _Nullable _RitmusGetLastForeignDelegate(void);
