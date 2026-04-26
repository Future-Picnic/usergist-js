#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Public Objective-C bridge. The actual implementation lives in
// RitmusPushImpl.swift; this class is a thin shim that React Native's
// runtime can instantiate (RN's auto-discovery requires an Obj-C class
// or a TurboModule registration).
@interface RitmusPush : RCTEventEmitter <RCTBridgeModule>
@end
