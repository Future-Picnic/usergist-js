#import "UserGistPush.h"
#import <React/RCTLog.h>
#import <Security/Security.h>

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

static NSString * const UserGistSecureService = @"studio.usergist.feedback.react-native";

static NSMutableDictionary *UserGistSecureQuery(NSString *key) {
  return [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: UserGistSecureService,
    (__bridge id)kSecAttrAccount: key,
  } mutableCopy];
}

RCT_EXPORT_METHOD(secureGetItem:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSMutableDictionary *query = UserGistSecureQuery(key);
  query[(__bridge id)kSecReturnData] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  if (status == errSecItemNotFound) { resolve(nil); return; }
  if (status != errSecSuccess) {
    reject(@"secure_read_failed", [NSString stringWithFormat:@"Keychain read failed: %d", (int)status], nil);
    return;
  }
  NSData *data = CFBridgingRelease(result);
  resolve([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
}

RCT_EXPORT_METHOD(secureSetItem:(NSString *)key
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  NSMutableDictionary *query = UserGistSecureQuery(key);
  OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query,
                                  (__bridge CFDictionaryRef)@{(__bridge id)kSecValueData: data});
  if (status == errSecItemNotFound) {
    query[(__bridge id)kSecValueData] = data;
    query[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlock;
    status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
  }
  if (status != errSecSuccess) {
    reject(@"secure_write_failed", [NSString stringWithFormat:@"Keychain write failed: %d", (int)status], nil);
    return;
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(secureRemoveItem:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)UserGistSecureQuery(key));
  if (status != errSecSuccess && status != errSecItemNotFound) {
    reject(@"secure_remove_failed", [NSString stringWithFormat:@"Keychain delete failed: %d", (int)status], nil);
    return;
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(secureMultiRemove:(NSArray<NSString *> *)keys
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  for (NSString *key in keys) {
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)UserGistSecureQuery(key));
    if (status != errSecSuccess && status != errSecItemNotFound) {
      reject(@"secure_remove_failed", [NSString stringWithFormat:@"Keychain delete failed: %d", (int)status], nil);
      return;
    }
  }
  resolve(nil);
}

@end
