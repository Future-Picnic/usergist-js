require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name             = 'UserGistFeedback'
  s.version          = package['version']
  s.summary          = package['description']
  s.description      = package['description']
  s.homepage         = 'https://github.com/FuturePicnic/usergist'
  s.license          = { :type => 'MIT' }
  s.authors          = { 'userGist' => 'engineering@usergist.studio' }
  s.platforms        = { :ios => '13.0' }
  s.source           = { :git => 'https://github.com/FuturePicnic/usergist.git', :tag => "v#{s.version}" }

  s.requires_arc     = true
  s.swift_version    = '5.7'

  # Default subspec — what RN autolinking picks up for the host app target.
  s.default_subspec = 'Core'

  # ---------- Core subspec (for the main app target) ----------
  # The RN bridge module: RCTBridgeModule, RCTEventEmitter, Swift impl.
  # Pulls in React-Core because it imports <React/...> headers.
  s.subspec 'Core' do |core|
    core.source_files = 'ios/*.{h,m,mm,swift}'
    core.frameworks   = 'UIKit', 'UserNotifications'
    core.dependency 'React-Core'
  end

  # ---------- Extension subspec (for the iOS NotificationServiceExtension) ----------
  # IMPORTANT: NSEs run in their own out-of-process extension and must NOT
  # depend on React-Core (it would pull ~50MB of RN runtime into a 30s
  # extension and likely fail to build under static linkage anyway).
  # Only the standalone Swift NSE base class lives here.
  s.subspec 'Extension' do |ext|
    ext.source_files = 'ios/Extension/*.swift'
    ext.frameworks   = 'UserNotifications'
  end
end
