#import "RitmusPush.h"
#import <React/RCTLog.h>

#if __has_include("RitmusFeedback-Swift.h")
#import "RitmusFeedback-Swift.h"
#else
#import <RitmusFeedback/RitmusFeedback-Swift.h>
#endif

// Bridges the React Native runtime to RitmusPushImpl.swift. We expose
// the module under the JS name "RitmusPush" and forward every method
// call (and outgoing event) to the singleton Swift impl.
//
// Events the Swift side emits and JS subscribes to:
//   - "RitmusPush:tokenReceived"          — APNs token captured
//   - "RitmusPush:tokenError"             — APNs registration failed
//   - "RitmusPush:notificationReceived"   — foreground delivery
//   - "RitmusPush:notificationOpened"     — user tapped a notification
@interface RitmusPush ()
@end

@implementation RitmusPush

RCT_EXPORT_MODULE(RitmusPush)

+ (BOOL)requiresMainQueueSetup {
  // We register UNUserNotificationCenter delegates on the main thread and
  // bind to UIApplication; doing the setup on the main queue avoids early
  // dispatch races during app launch.
  return YES;
}

- (instancetype)init {
  if ((self = [super init])) {
    [RitmusPushImpl.shared bindEmitter:self];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"RitmusPush:tokenReceived",
    @"RitmusPush:tokenError",
    @"RitmusPush:notificationReceived",
    @"RitmusPush:notificationOpened",
  ];
}

- (void)startObserving {
  [RitmusPushImpl.shared setHasJsListeners:YES];
}

- (void)stopObserving {
  [RitmusPushImpl.shared setHasJsListeners:NO];
}

// MARK: - Exported methods

RCT_EXPORT_METHOD(enablePush:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [RitmusPushImpl.shared enablePushWithOptions:options resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(disablePush:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [RitmusPushImpl.shared disablePushWithResolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(getPushPermissionStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [RitmusPushImpl.shared getPermissionStatusWithResolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(setBadgeCount:(double)count
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [RitmusPushImpl.shared setBadgeCount:count resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(getInitialNotification:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [RitmusPushImpl.shared getInitialNotificationWithResolver:resolve rejecter:reject];
}

@end
