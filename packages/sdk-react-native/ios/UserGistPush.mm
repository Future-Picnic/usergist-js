#import "UserGistPush.h"
#import <React/RCTLog.h>

#if __has_include("UserGistFeedback-Swift.h")
#import "UserGistFeedback-Swift.h"
#else
#import <UserGistFeedback/UserGistFeedback-Swift.h>
#endif

// Bridges the React Native runtime to UserGistPushImpl.swift. We expose
// the module under the JS name "UserGistPush" and forward every method
// call (and outgoing event) to the singleton Swift impl.
//
// Events the Swift side emits and JS subscribes to:
//   - "UserGistPush:tokenReceived"          — APNs token captured
//   - "UserGistPush:tokenError"             — APNs registration failed
//   - "UserGistPush:notificationReceived"   — foreground delivery
//   - "UserGistPush:notificationOpened"     — user tapped a notification
@interface UserGistPush ()
@end

@implementation UserGistPush

RCT_EXPORT_MODULE(UserGistPush)

+ (BOOL)requiresMainQueueSetup {
  // We register UNUserNotificationCenter delegates on the main thread and
  // bind to UIApplication; doing the setup on the main queue avoids early
  // dispatch races during app launch.
  return YES;
}

- (instancetype)init {
  if ((self = [super init])) {
    [UserGistPushImpl.shared bindEmitter:self];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"UserGistPush:tokenReceived",
    @"UserGistPush:tokenError",
    @"UserGistPush:notificationReceived",
    @"UserGistPush:notificationOpened",
  ];
}

- (void)startObserving {
  [UserGistPushImpl.shared setHasJsListeners:YES];
}

- (void)stopObserving {
  [UserGistPushImpl.shared setHasJsListeners:NO];
}

// MARK: - Exported methods

RCT_EXPORT_METHOD(enablePush:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [UserGistPushImpl.shared enablePushWithOptions:options resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(disablePush:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [UserGistPushImpl.shared disablePushWithResolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(getPushPermissionStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [UserGistPushImpl.shared getPermissionStatusWithResolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(setBadgeCount:(double)count
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [UserGistPushImpl.shared setBadgeCount:count resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(getInitialNotification:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [UserGistPushImpl.shared getInitialNotificationWithResolver:resolve rejecter:reject];
}

@end
