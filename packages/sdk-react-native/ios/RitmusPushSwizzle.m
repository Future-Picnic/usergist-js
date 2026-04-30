// Pure Obj-C swizzle for capturing the APNs device token from the host
// app's UIApplicationDelegate without requiring any AppDelegate edits.
//
// Why Obj-C: Swift methods even with `@objc dynamic` go through Swift's
// vtable thunking. When method_getImplementation returns the IMP, calling
// it on a `self` of a different class can hit Swift-specific guards that
// silently no-op the call. A bare Obj-C IMP installed via
// `imp_implementationWithBlock` has the standard objc_msgSend ABI and runs
// on any NSObject subclass without surprises.
//
// On +load (which runs before main()), we register for the early
// `UIApplicationDidFinishLaunchingNotification` so we can grab the live
// AppDelegate class and patch it. After that, `registerForRemoteNotifications`
// callbacks land in our block, which forwards to the Swift impl.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#import <objc/runtime.h>
#import <objc/message.h>

#if __has_include("RitmusFeedback-Swift.h")
#import "RitmusFeedback-Swift.h"
#else
#import <RitmusFeedback/RitmusFeedback-Swift.h>
#endif

@interface RitmusPushSwizzle : NSObject
@end

@implementation RitmusPushSwizzle

+ (void)load {
    // The UN setter-swizzle MUST run as early as possible — before
    // AppDelegate.didFinishLaunching, which is when FirebaseApp.configure()
    // typically runs and may install its own UN delegate. +load fires at
    // image load time, well before main(), so we win that race.
    [self installUNDelegateSetterSwizzle];

    // Force-instantiate the Swift singleton so its `init` runs and our
    // shared UN delegate is available the very first time the setter
    // swizzle fires. Otherwise the first foreign `setDelegate:` call
    // (typically Firebase) would still hit the original setter because
    // ritmusUNDelegate() returned nil.
    Class implCls = NSClassFromString(@"RitmusFeedback.RitmusPushImpl");
    if (!implCls) implCls = NSClassFromString(@"RitmusPushImpl");
    if (implCls) {
        SEL sharedSel = NSSelectorFromString(@"shared");
        if ([implCls respondsToSelector:sharedSel]) {
            (void)((id (*)(id, SEL))objc_msgSend)(implCls, sharedSel);
            NSLog(@"[RitmusPush] +load: RitmusPushImpl.shared force-initialized");
        }
    }

    // AppDelegate-class swizzles (didRegister / didFail) can't run yet —
    // the host's AppDelegate class isn't instantiated until iOS launches it.
    // Defer those to UIApplicationDidFinishLaunchingNotification.
    [[NSNotificationCenter defaultCenter]
        addObserver:self
           selector:@selector(_ritmusInstallSwizzles:)
               name:UIApplicationDidFinishLaunchingNotification
             object:nil];
}

+ (void)_ritmusInstallSwizzles:(NSNotification *)note {
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:UIApplicationDidFinishLaunchingNotification
                                                  object:nil];
    Class delegateClass = [[[UIApplication sharedApplication] delegate] class];
    if (!delegateClass) {
        NSLog(@"[RitmusPush] +load swizzle: no AppDelegate at didFinishLaunching — skipping");
        return;
    }
    NSLog(@"[RitmusPush] +load swizzle: target class = %@", NSStringFromClass(delegateClass));

    [self installDidRegister:delegateClass];
    [self installDidFail:delegateClass];

    NSLog(@"[RitmusPush] +load swizzle: complete");
}

// Holds whoever the host (or another SDK like FirebaseAnalytics) most
// recently tried to install as the UNUserNotificationCenter delegate.
// Read by RitmusUNDelegateSwizzler so it can chain didReceive / willPresent
// to the displaced delegate.
static id<NSObject> _ritmus_lastForeignDelegate = nil;

// Swizzle UNUserNotificationCenter.setDelegate: so any code that tries to
// install its own delegate (FirebaseAnalytics, OneSignal, Notifee, the
// host app itself) is intercepted. Their delegate is captured as the
// "foreign" chain target; our shared delegate stays installed.
+ (void)installUNDelegateSetterSwizzle {
    Class cls = [UNUserNotificationCenter class];
    SEL setterSel = @selector(setDelegate:);
    Method existing = class_getInstanceMethod(cls, setterSel);
    if (!existing) {
        NSLog(@"[RitmusPush] setDelegate: not found on UNUserNotificationCenter — skipping");
        return;
    }
    IMP origImp = method_getImplementation(existing);
    IMP newImp = imp_implementationWithBlock(
        ^(UNUserNotificationCenter *_self, id<NSObject> incoming) {
            // Pull the Swift-side shared delegate via the public Swift class.
            // RitmusFeedback-Swift.h exposes RitmusPushImpl; we route through
            // it to install + record the foreign chain target.
            Class implCls = NSClassFromString(@"RitmusFeedback.RitmusPushImpl");
            if (!implCls) implCls = NSClassFromString(@"RitmusPushImpl");
            id sharedDelegate = nil;
            if (implCls) {
                SEL ritmusSharedSel = NSSelectorFromString(@"ritmusUNDelegate");
                if ([implCls respondsToSelector:ritmusSharedSel]) {
                    sharedDelegate = ((id (*)(id, SEL))objc_msgSend)(implCls, ritmusSharedSel);
                }
            }
            if (incoming && sharedDelegate && incoming != sharedDelegate) {
                NSLog(@"[RitmusPush] setDelegate: foreign=%@, keeping ours; chain target captured",
                      NSStringFromClass([incoming class]));
                _ritmus_lastForeignDelegate = incoming;
                ((void (*)(id, SEL, id))origImp)(_self, setterSel, sharedDelegate);
                return;
            }
            ((void (*)(id, SEL, id))origImp)(_self, setterSel, incoming);
        });
    method_setImplementation(existing, newImp);
    NSLog(@"[RitmusPush] UN setDelegate swizzle installed");
}

// Exposed to Swift via the bridging header — the Swift swizzler reads this
// when chaining didReceive / willPresent.
NSObject *_RitmusGetLastForeignDelegate(void) {
    return (NSObject *)_ritmus_lastForeignDelegate;
}

+ (void)installDidRegister:(Class)cls {
    SEL sel = @selector(application:didRegisterForRemoteNotificationsWithDeviceToken:);
    IMP newImp = imp_implementationWithBlock(^(id _self, UIApplication *app, NSData *deviceToken) {
        NSLog(@"[RitmusPush] swizzled didRegister fired (token len=%lu)",
              (unsigned long)deviceToken.length);
        [[RitmusPushImpl shared] recordTokenWithDeviceToken:deviceToken];
        // Chain — if the original delegate had its own impl we replaced, the
        // exchanged IMP lives under sel `_ritmus_orig_didRegister:`.
        SEL chainSel = NSSelectorFromString(@"_ritmus_orig_application:didRegisterForRemoteNotificationsWithDeviceToken:");
        if ([_self respondsToSelector:chainSel]) {
            ((void (*)(id, SEL, UIApplication *, NSData *))objc_msgSend)(_self, chainSel, app, deviceToken);
        }
    });
    Method existing = class_getInstanceMethod(cls, sel);
    if (existing) {
        // Save the original under a different selector so we can chain.
        SEL chainSel = NSSelectorFromString(@"_ritmus_orig_application:didRegisterForRemoteNotificationsWithDeviceToken:");
        class_addMethod(cls, chainSel, method_getImplementation(existing), method_getTypeEncoding(existing));
        method_setImplementation(existing, newImp);
    } else {
        class_addMethod(cls, sel, newImp, "v@:@@");
    }
}

+ (void)installDidFail:(Class)cls {
    SEL sel = @selector(application:didFailToRegisterForRemoteNotificationsWithError:);
    IMP newImp = imp_implementationWithBlock(^(id _self, UIApplication *app, NSError *err) {
        NSLog(@"[RitmusPush] swizzled didFail fired: %@", err.localizedDescription);
        [[RitmusPushImpl shared] recordTokenErrorWithError:err];
        SEL chainSel = NSSelectorFromString(@"_ritmus_orig_application:didFailToRegisterForRemoteNotificationsWithError:");
        if ([_self respondsToSelector:chainSel]) {
            ((void (*)(id, SEL, UIApplication *, NSError *))objc_msgSend)(_self, chainSel, app, err);
        }
    });
    Method existing = class_getInstanceMethod(cls, sel);
    if (existing) {
        SEL chainSel = NSSelectorFromString(@"_ritmus_orig_application:didFailToRegisterForRemoteNotificationsWithError:");
        class_addMethod(cls, chainSel, method_getImplementation(existing), method_getTypeEncoding(existing));
        method_setImplementation(existing, newImp);
    } else {
        class_addMethod(cls, sel, newImp, "v@:@@");
    }
}

@end
