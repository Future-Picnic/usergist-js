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
#import <objc/runtime.h>

#if __has_include("RitmusFeedback-Swift.h")
#import "RitmusFeedback-Swift.h"
#else
#import <RitmusFeedback/RitmusFeedback-Swift.h>
#endif

@interface RitmusPushSwizzle : NSObject
@end

@implementation RitmusPushSwizzle

+ (void)load {
    // Register as early as possible. UIApplicationDidFinishLaunchingNotification
    // fires after AppDelegate is set; we patch its class then.
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
