#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <Foundation/Foundation.h>
#import "UserGistPushInterop.h"

// Public Objective-C bridge. The actual implementation lives in
// UserGistPushImpl.swift; this class is a thin shim that React Native's
// runtime can instantiate (RN's auto-discovery requires an Obj-C class
// or a TurboModule registration).
@interface UserGistPush : RCTEventEmitter <RCTBridgeModule>
@end
