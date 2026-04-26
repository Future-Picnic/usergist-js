require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name             = 'RitmusFeedback'
  s.version          = package['version']
  s.summary          = package['description']
  s.description      = package['description']
  s.homepage         = 'https://github.com/studio-Ritmus/ritmus'
  s.license          = { :type => 'MIT' }
  s.authors          = { 'Ritmus' => 'engineering@ritmus.studio' }
  s.platforms        = { :ios => '13.0' }
  s.source           = { :git => 'https://github.com/studio-Ritmus/ritmus.git', :tag => "v#{s.version}" }

  s.source_files     = 'ios/**/*.{h,m,mm,swift}'
  s.requires_arc     = true
  s.swift_version    = '5.7'

  # No Firebase on iOS — pure APNs via UserNotifications + UIKit.
  s.frameworks       = 'UIKit', 'UserNotifications'

  # React-Core covers the bridge / native module base. New-architecture flag
  # is forwarded to the codegen output paths via standard RN 0.74+ conventions.
  s.dependency 'React-Core'
end
