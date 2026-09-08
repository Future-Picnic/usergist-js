#import <Foundation/Foundation.h>

// Swift needs this C entry point, but must not re-export React's bridge
// declarations through UserGistFeedback's public umbrella header.
FOUNDATION_EXPORT NSObject * _Nullable _UserGistGetLastForeignDelegate(void);
