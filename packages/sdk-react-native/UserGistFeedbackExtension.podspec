require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# The Notification Service Extension is deliberately a separate pod. CocoaPods
# gives every subspec the root pod's Swift module name, which causes Xcode to
# infer circular dependencies when the app bridge and extension are embedded in
# the same workspace. This pod contains no React Native runtime dependency.
Pod::Spec.new do |s|
  s.name             = 'UserGistFeedbackExtension'
  s.version          = package['version']
  s.summary          = 'UserGist notification service extension support'
  s.description      = 'Lightweight iOS notification service extension support for UserGist React Native applications.'
  s.homepage         = 'https://github.com/Future-Picnic/usergist-js'
  s.license          = { :type => 'MIT', :file => 'LICENSE' }
  s.authors          = { 'userGist' => 'engineering@usergist.com' }
  s.platforms        = { :ios => '13.0' }
  s.source           = { :git => 'https://github.com/Future-Picnic/usergist-js.git', :tag => "v#{s.version}" }
  s.requires_arc     = true
  s.swift_version    = '5.7'
  s.source_files     = 'ios/Extension/*.swift'
  s.frameworks       = 'UserNotifications'
end
